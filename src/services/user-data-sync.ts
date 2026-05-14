import type { Arp, ArpItem, ComprasGovClient } from "../clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../clients/portal-transparencia.js";
import {
  normalizeDigits,
  type SqliteSyncRepository,
} from "../db/sync-repository.js";
import { AuthError } from "./auth.js";
import { normalizeUasg } from "./user-uasgs.js";

/**
 * Thrown when the items endpoint returns an empty result for an ARP whose
 * metadata claims it has items. The compras API often serves partial data
 * mid-incident; treating this as a per-ARP failure routes the ARP into the
 * retry-incomplete sweep instead of silently leaving it item-less.
 */
export class EmptyItemsError extends Error {
  constructor(numeroControlePncpAta: string, expected: number) {
    super(
      `ARP ${numeroControlePncpAta} returned 0 items (expected ${expected})`,
    );
    this.name = "EmptyItemsError";
  }
}

export interface SyncResult {
  arps: number;
  items: number;
  pessoasJuridicas: number;
  empenhos: number;
}

export interface SyncProgress {
  inProgress: boolean;
  phase: "arps" | "items" | "empenhos" | null;
  totalArps: number;
  processedArps: number;
  failedArps: number;
  currentArp: string | null;
  currentArpItemPage: number | null;
  currentArpItemTotalPages: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

/**
 * Out-of-band progress sink. The job runner uses this to mirror in-memory
 * progress to the persisted sync_jobs row; tests/inline callers can pass
 * undefined and rely on the in-memory map only.
 */
export interface SyncProgressSink {
  setPhase(phase: SyncProgress["phase"]): void;
  setTotalArps(n: number): void;
  startArp(numero: string): void;
  setItemsPage(page: number | null, totalPages: number | null): void;
  arpDone(): void;
  arpFailed(err: unknown): void;
}

const EMPTY_PROGRESS: SyncProgress = {
  inProgress: false,
  phase: null,
  totalArps: 0,
  processedArps: 0,
  failedArps: 0,
  currentArp: null,
  currentArpItemPage: null,
  currentArpItemTotalPages: null,
  startedAt: null,
  finishedAt: null,
  lastError: null,
};

export class UserDataSyncService {
  private readonly progressByUasg = new Map<string, SyncProgress>();

  constructor(
    private readonly repository: SqliteSyncRepository,
    private readonly comprasClient: ComprasGovClient,
    private readonly portalClient: PortalTransparenciaClient,
  ) {}

  getSyncProgress(codigoUasg: string): SyncProgress {
    const key = normalizeUasg(codigoUasg);
    return this.progressByUasg.get(key) ?? { ...EMPTY_PROGRESS };
  }

  listArpsForUasg(codigoUasg: string): Arp[] {
    return this.repository
      .findArpsByUasg(normalizeUasg(codigoUasg))
      .map((r) => r.raw);
  }

  listArpSummariesForUasg(codigoUasg: string): {
    arp: Arp;
    itemCount: number;
    expectedItems: number | null;
    empenhoCount: number;
    lastSyncedAt: string;
    lastChangedAt: string | null;
    lastItemsSyncedAt: string | null;
    lastItemsChangedAt: string | null;
    lastEmpenhosSyncedAt: string | null;
    lastEmpenhosChangedAt: string | null;
  }[] {
    return this.repository
      .findArpsSummaryByUasg(normalizeUasg(codigoUasg))
      .map((row) => ({
        arp: row.arp,
        itemCount: row.itemCount,
        expectedItems: row.arp.quantidadeItens ?? null,
        empenhoCount: row.empenhoCount,
        lastSyncedAt: row.lastSyncedAt,
        lastChangedAt: row.lastChangedAt,
        lastItemsSyncedAt: row.lastItemsSyncedAt,
        lastItemsChangedAt: row.lastItemsChangedAt,
        lastEmpenhosSyncedAt: row.lastEmpenhosSyncedAt,
        lastEmpenhosChangedAt: row.lastEmpenhosChangedAt,
      }));
  }

  listItemsForArp(
    numeroControlePncpAta: string,
  ): (ArpItem & { lastSyncedAt: string; lastChangedAt: string | null })[] {
    return this.repository
      .findItemsByArp(numeroControlePncpAta)
      .map((r) => ({
        ...r.raw,
        lastSyncedAt: r.lastSyncedAt,
        lastChangedAt: r.lastChangedAt,
      }));
  }

  listEmpenhosForArp(
    numeroControlePncpAta: string,
  ): Record<string, unknown[]> {
    const rows = this.repository.findEmpenhosByArp(numeroControlePncpAta);
    const grouped: Record<string, unknown[]> = {};
    for (const row of rows) {
      (grouped[row.numeroItem] ??= []).push(row.raw);
    }
    return grouped;
  }

  listPessoasJuridicasForArp(
    numeroControlePncpAta: string,
  ): Record<string, unknown> {
    const rows = this.repository.findPessoasJuridicasByArp(numeroControlePncpAta);
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      map[row.cnpj] = row.raw;
    }
    return map;
  }

  userOwnsArp(userId: string, numeroControlePncpAta: string): boolean {
    return this.repository.userOwnsArp(userId, numeroControlePncpAta);
  }

  userOwnsItem(
    userId: string,
    numeroControlePncpAta: string,
    numeroItem: string,
  ): boolean {
    return this.repository.userOwnsItem(
      userId,
      numeroControlePncpAta,
      numeroItem,
    );
  }

  userOwnsPessoaJuridica(userId: string, cnpj: string): boolean {
    return this.repository.userOwnsPessoaJuridica(userId, cnpj);
  }

  async syncUasg(
    codigoUasg: string,
    sink?: SyncProgressSink,
  ): Promise<SyncResult> {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    const result: SyncResult = {
      arps: 0,
      items: 0,
      pessoasJuridicas: 0,
      empenhos: 0,
    };

    // Single-flight per UASG: if a sync is already running, skip — the caller
    // can poll getSyncProgress() to track the in-flight one.
    const existing = this.progressByUasg.get(normalizedCodigoUasg);
    if (existing?.inProgress) {
      return result;
    }

    const progress: SyncProgress = {
      inProgress: true,
      phase: "arps",
      totalArps: 0,
      processedArps: 0,
      failedArps: 0,
      currentArp: null,
      currentArpItemPage: null,
      currentArpItemTotalPages: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null,
    };
    this.progressByUasg.set(normalizedCodigoUasg, progress);

    try {
      // Phase 1: fetch and persist ARP metadata. If this fails the whole sync
      // fails — there's nothing to iterate over.
      const arps =
        await this.comprasClient.consultarArpsPorUnidadeGerenciadora(
          normalizedCodigoUasg,
        );
      for (const arp of arps) {
        this.repository.upsertArp(normalizedCodigoUasg, arp);
        result.arps += 1;
      }
      progress.totalArps = arps.length;
      sink?.setTotalArps(arps.length);
      progress.phase = "items";
      sink?.setPhase("items");

      // Phase 2: per-ARP items + empenhos. The compras API is unreliable, so
      // each ARP runs under its own try/catch — one bad upstream call must
      // not stop the rest of the UASG from syncing.
      for (const arp of arps) {
        progress.currentArp = arp.numeroControlePncpAta;
        sink?.startArp(arp.numeroControlePncpAta);
        try {
          // Items: skip if DB already has the expected count. When upstream
          // omits quantidadeItens (or returns 0) we fall back to "any rows
          // present means synced" — the previous `>= (quantidadeItens ?? 0)`
          // heuristic skipped empty ARPs entirely.
          progress.phase = "items";
          sink?.setPhase("items");
          progress.currentArpItemPage = null;
          progress.currentArpItemTotalPages = null;
          sink?.setItemsPage(null, null);
          const expected = arp.quantidadeItens;
          const have = this.repository.countItemsByArp(arp.numeroControlePncpAta);
          const itemsSynced = expected && expected > 0 ? have >= expected : have > 0;
          if (!itemsSynced) {
            result.items += await this.saveItemsForArp(
              arp.numeroControlePncpAta,
              (page, totalPages) => {
                progress.currentArpItemPage = page;
                progress.currentArpItemTotalPages = totalPages;
                sink?.setItemsPage(page, totalPages);
              },
              expected,
            );
          }

          // Empenhos: one call per ARP covers every item. Skip if we already
          // have rows persisted for this ARP.
          progress.phase = "empenhos";
          sink?.setPhase("empenhos");
          progress.currentArpItemPage = null;
          progress.currentArpItemTotalPages = null;
          sink?.setItemsPage(null, null);
          if (
            this.repository.findEmpenhosByArp(arp.numeroControlePncpAta)
              .length === 0
          ) {
            result.empenhos += await this.refreshAllEmpenhosForArp(
              arp.numeroControlePncpAta,
            );
          }

          progress.processedArps += 1;
          sink?.arpDone();
        } catch (err) {
          progress.failedArps += 1;
          progress.lastError = err instanceof Error ? err.message : String(err);
          sink?.arpFailed(err);
        }
      }

      // Retry pass: re-process any ARP whose items or empenhos never landed.
      // The compras API often flakes mid-sync (Hikari pool exhaustion, 502s);
      // a follow-up sweep against the still-incomplete tail recovers most
      // cases without re-fetching the whole UASG.
      const MAX_RETRY_PASSES = 3;
      for (let pass = 0; pass < MAX_RETRY_PASSES; pass++) {
        const incomplete = this.repository
          .findArpsSummaryByUasg(normalizedCodigoUasg)
          .filter(
            (s) =>
              s.lastItemsSyncedAt === null || s.lastEmpenhosSyncedAt === null,
          );
        if (incomplete.length === 0) break;
        for (const summary of incomplete) {
          const arp = summary.arp;
          progress.currentArp = arp.numeroControlePncpAta;
          sink?.startArp(arp.numeroControlePncpAta);
          try {
            if (summary.lastItemsSyncedAt === null) {
              progress.phase = "items";
              sink?.setPhase("items");
              progress.currentArpItemPage = null;
              progress.currentArpItemTotalPages = null;
              sink?.setItemsPage(null, null);
              result.items += await this.saveItemsForArp(
                arp.numeroControlePncpAta,
                (page, totalPages) => {
                  progress.currentArpItemPage = page;
                  progress.currentArpItemTotalPages = totalPages;
                  sink?.setItemsPage(page, totalPages);
                },
                arp.quantidadeItens,
              );
            }
            if (summary.lastEmpenhosSyncedAt === null) {
              progress.phase = "empenhos";
              sink?.setPhase("empenhos");
              progress.currentArpItemPage = null;
              progress.currentArpItemTotalPages = null;
              sink?.setItemsPage(null, null);
              result.empenhos += await this.refreshAllEmpenhosForArp(
                arp.numeroControlePncpAta,
              );
            }
            // Recovered: convert one failure into a success (only if pass 1
            // counted it as a failure). Skip the bookkeeping if the ARP just
            // happened to have null timestamps from a prior partial sync.
            if (progress.failedArps > 0) {
              progress.failedArps -= 1;
              progress.processedArps += 1;
              sink?.arpDone();
            }
          } catch (err) {
            progress.lastError =
              err instanceof Error ? err.message : String(err);
            // Don't bump failedArps again — already counted in pass 1.
            sink?.arpFailed(err);
          }
        }
      }
    } finally {
      progress.inProgress = false;
      progress.phase = null;
      progress.currentArp = null;
      progress.finishedAt = new Date().toISOString();
      sink?.setPhase(null);
    }

    return result;
  }

  async syncItemsForArps(codigoUasg: string, arps: Arp[]): Promise<void> {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    for (const arp of arps) {
      this.repository.upsertArp(normalizedCodigoUasg, arp);
      await this.saveItemsForArp(arp.numeroControlePncpAta);
    }
  }

  async syncUasgForUser(
    userId: string,
    codigoUasg: string,
  ): Promise<SyncResult> {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    if (!this.repository.userOwnsUasg(userId, normalizedCodigoUasg)) {
      throw new AuthError("UASG is not linked to this user", 403);
    }
    return this.syncUasg(normalizedCodigoUasg);
  }

  getSyncProgressForUser(userId: string, codigoUasg: string): SyncProgress {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    if (!this.repository.userOwnsUasg(userId, normalizedCodigoUasg)) {
      throw new AuthError("UASG is not linked to this user", 403);
    }
    return this.getSyncProgress(normalizedCodigoUasg);
  }

  async refreshArp(numeroControlePncpAta: string): Promise<SyncResult> {
    const storedArp = this.repository.findArp(numeroControlePncpAta);
    if (!storedArp) {
      throw new Error("ARP not found");
    }

    // Skip the UASG-wide ARP relist (compras has no single-ARP endpoint and
    // the paginated UG fetch is what makes refresh hang). Trust stored
    // metadata and only refresh items + suppliers + empenhos for this ARP.
    const itemResult = await this.refreshItemsForArp(numeroControlePncpAta);
    return { arps: 0, ...itemResult };
  }

  async refreshItem(
    numeroControlePncpAta: string,
    numeroItem: string,
  ): Promise<SyncResult> {
    const item = await this.fetchItem(numeroControlePncpAta, numeroItem);
    this.repository.upsertArpItem(numeroControlePncpAta, item);
    const pessoasJuridicas = await this.refreshSupplier(item);
    // Upstream returns all empenhos for the ATA in one call, so refreshing
    // a single item refreshes empenhos for the whole ARP.
    const empenhos = await this.refreshAllEmpenhosForArp(numeroControlePncpAta, {
      numeroAta: item.numeroAtaRegistroPreco,
      unidadeGerenciadora: item.codigoUnidadeGerenciadora,
    });
    return { arps: 0, items: 1, pessoasJuridicas, empenhos };
  }

  async refreshItemEmpenhos(
    numeroControlePncpAta: string,
    numeroItem: string,
  ): Promise<SyncResult> {
    const storedItem = this.repository.findItem(
      numeroControlePncpAta,
      numeroItem,
    );
    if (!storedItem) {
      throw new Error("ARP item not found");
    }
    // Single upstream call covers every item under the ATA.
    const empenhos = await this.refreshAllEmpenhosForArp(numeroControlePncpAta, {
      numeroAta: storedItem.raw.numeroAtaRegistroPreco,
      unidadeGerenciadora: storedItem.raw.codigoUnidadeGerenciadora,
    });
    return { arps: 0, items: 0, pessoasJuridicas: 0, empenhos };
  }

  async refreshPessoaJuridica(cnpj: string): Promise<void> {
    const normalizedCnpj = normalizeDigits(cnpj);
    if (!normalizedCnpj || normalizedCnpj.length !== 14) {
      throw new Error("CNPJ must contain 14 digits");
    }
    const pessoa = await this.portalClient.getPessoaJuridica(normalizedCnpj);
    this.repository.upsertPessoaJuridica(normalizedCnpj, pessoa);
  }

  private async saveItemsForArp(
    numeroControlePncpAta: string,
    onPage?: (page: number, totalPages: number) => void,
    expectedCount?: number,
  ): Promise<number> {
    const items = await this.comprasClient.consultarItensDaArp(
      numeroControlePncpAta,
      onPage,
    );
    if (
      expectedCount != null &&
      expectedCount > 0 &&
      items.length === 0
    ) {
      throw new EmptyItemsError(numeroControlePncpAta, expectedCount);
    }
    for (const item of items) {
      this.repository.upsertArpItem(numeroControlePncpAta, item);
    }
    // Compras' quantidadeItens counts historical revisions; reconcile to the
    // deduped unique-item count so progress checks and UI badges match.
    this.repository.setArpQuantidadeItens(numeroControlePncpAta, items.length);
    return items.length;
  }

  private async refreshItemsForArp(
    numeroControlePncpAta: string,
  ): Promise<Omit<SyncResult, "arps">> {
    const result = { items: 0, pessoasJuridicas: 0, empenhos: 0 };
    let items: ArpItem[];
    try {
      items = await this.comprasClient.consultarItensDaArp(numeroControlePncpAta);
    } catch {
      // Items endpoint failed — fall back to whatever's already in DB so
      // suppliers + empenhos can still refresh and the user keeps existing data.
      items = this.repository.findItemsByArp(numeroControlePncpAta).map((r) => r.raw);
    }
    // Sequential: the compras client enforces a global rate limit; running
    // these in parallel just builds a queue and amplifies 429 backoffs.
    // Errors are isolated per item so one bad upstream call doesn't stop
    // the rest of the ARP from syncing.
    for (const item of items) {
      this.repository.upsertArpItem(numeroControlePncpAta, item);
      result.items += 1;
      try {
        result.pessoasJuridicas += await this.refreshSupplier(item);
      } catch {
        // supplier failure must not block empenho persistence
      }
    }

    // Empenhos: one upstream call covers every item in the ATA.
    try {
      result.empenhos += await this.refreshAllEmpenhosForArp(
        numeroControlePncpAta,
      );
    } catch {
      // empenho failure isolated from item/supplier results
    }

    return result;
  }

  private async fetchItem(
    numeroControlePncpAta: string,
    numeroItem: string,
  ): Promise<ArpItem> {
    const items = await this.comprasClient.consultarItensDaArp(
      numeroControlePncpAta,
    );
    const item = items.find((candidate) => candidate.numeroItem === numeroItem);
    if (!item) {
      throw new Error("ARP item not found");
    }
    return item;
  }

  private async refreshSupplier(item: ArpItem): Promise<number> {
    const cnpj = normalizeDigits(item.niFornecedor);
    if (!cnpj || cnpj.length !== 14) {
      return 0;
    }
    const pessoa = await this.portalClient.getPessoaJuridica(cnpj);
    this.repository.upsertPessoaJuridica(cnpj, pessoa);
    return 1;
  }

  /**
   * The compras endpoint /modulo-arp/4_consultarEmpenhosSaldoItem despite its
   * name returns ALL empenhos for the ATA in one call (each row carries its
   * own numeroItem). So we fetch once per ARP, bucket the response by the
   * empenho's own numeroItem, and persist each row under the right item.
   * Stale rows are dropped first to keep the table free of leftover dupes
   * from the previous (per-item) implementation.
   */
  private async refreshAllEmpenhosForArp(
    numeroControlePncpAta: string,
    fallback?: { numeroAta?: string; unidadeGerenciadora?: string },
  ): Promise<number> {
    if (!this.comprasClient.consultarEmpenhosSaldoItem) {
      return 0;
    }
    const storedArp = this.repository.findArp(numeroControlePncpAta);
    const numeroAta =
      fallback?.numeroAta ?? storedArp?.raw.numeroAtaRegistroPreco;
    const unidadeGerenciadora =
      fallback?.unidadeGerenciadora ?? storedArp?.codigoUasg;

    if (!numeroAta || !unidadeGerenciadora) {
      return 0;
    }

    const empenhos = await this.comprasClient.consultarEmpenhosSaldoItem(
      numeroAta,
      unidadeGerenciadora,
    );

    this.repository.deleteEmpenhosByArp(numeroControlePncpAta);

    const counters: Record<string, number> = {};
    let count = 0;
    for (const empenho of empenhos) {
      const numeroItem = readEmpenhoNumeroItem(empenho) ?? "0";
      const idx = (counters[numeroItem] ?? 0);
      counters[numeroItem] = idx + 1;
      this.repository.upsertEmpenho(
        buildEmpenhoId(numeroControlePncpAta, numeroItem, empenho, idx),
        numeroControlePncpAta,
        numeroItem,
        empenho,
      );
      count += 1;
    }

    this.repository.markEmpenhosSync(numeroControlePncpAta);
    return count;
  }
}

function readEmpenhoNumeroItem(empenho: unknown): string | null {
  if (typeof empenho !== "object" || empenho === null) return null;
  const v = (empenho as { numeroItem?: unknown }).numeroItem;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function buildEmpenhoId(
  numeroControlePncpAta: string,
  numeroItem: string,
  empenho: unknown,
  index: number,
): string {
  if (
    typeof empenho === "object" &&
    empenho !== null &&
    "id" in empenho &&
    typeof empenho.id === "string"
  ) {
    return empenho.id;
  }
  return `${numeroControlePncpAta}:${numeroItem}:${index}`;
}
