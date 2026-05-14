import type { Arp } from "../clients/compras-gov.js";
import {
  PortalApiError,
  type PortalTransparenciaClient,
} from "../clients/portal-transparencia.js";
import type { SqlitePortalDataRepository } from "../db/portal-data-repository.js";
import {
  normalizeDigits,
  type SqliteSyncRepository,
} from "../db/sync-repository.js";
import { normalizeUasg } from "./user-uasgs.js";

export interface PortalSyncResult {
  suppliers: number;
  failedSuppliers: number;
  contratos: number;
  empenhos: number;
}

export interface PortalSyncOptions {
  includeDetails?: boolean;
  includeSancoes?: boolean;
  includeContratos?: boolean;
  /**
   * Years window for empenhos. When omitted, derived from the calling helper
   * (per-ARP from `dataVigenciaInicial` through current SP-local year).
   */
  years?: number[];
  progress?: PortalSyncProgressSink;
}

export interface PortalSyncProgressSink {
  setTotalSuppliers(n: number): void;
  startSupplier(cnpj: string): void;
  supplierDone(): void;
  supplierFailed(err: unknown): void;
}

const SP_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
});

export class PortalDataSyncService {
  constructor(
    private readonly portalRepo: SqlitePortalDataRepository,
    private readonly portalClient: PortalTransparenciaClient,
    private readonly syncRepo: SqliteSyncRepository,
  ) {}

  async syncSupplier(
    cnpj: string,
    opts: PortalSyncOptions = {},
  ): Promise<PortalSyncResult> {
    const result: PortalSyncResult = {
      suppliers: 0,
      failedSuppliers: 0,
      contratos: 0,
      empenhos: 0,
    };
    const normalizedCnpj = normalizeDigits(cnpj);
    if (!normalizedCnpj || normalizedCnpj.length !== 14) {
      result.failedSuppliers = 1;
      return result;
    }
    const includeDetails = opts.includeDetails ?? true;
    const includeSancoes = opts.includeSancoes ?? true;
    const includeContratos = opts.includeContratos ?? true;
    const years = opts.years ?? this.defaultYears();

    if (includeContratos) {
      try {
        const contratos = await this.portalClient.getContratosByCnpj(
          normalizedCnpj,
        );
        this.portalRepo.replaceContratos(normalizedCnpj, contratos);
        result.contratos = contratos.length;
      } catch (err) {
        if (!isExpected404(err)) {
          // partial-failure: keep going so we still pull empenhos
          result.failedSuppliers = 1;
        }
      }
    }

    let empenhos: unknown[] = [];
    try {
      empenhos = await this.portalClient.getEmpenhosAcrossYears(
        normalizedCnpj,
        years,
      );
    } catch (err) {
      if (!isExpected404(err)) {
        result.failedSuppliers = 1;
      }
    }

    // When includeDetails is false (background job path), the loop body has
    // no awaits. With thousands of empenhos that starves the event loop and
    // blocks all HTTP requests until the loop exits. Batch the writes in one
    // transaction and yield to the loop between batches.
    const BULK_BATCH = 500;
    const bulkRows: { documento: string; cnpj: string; ano: number; fase: number; raw: unknown }[] = [];
    const flushBulk = async (): Promise<void> => {
      if (bulkRows.length === 0) return;
      this.portalRepo.bulkUpsertEmpenhos(bulkRows);
      bulkRows.length = 0;
      await new Promise((r) => setImmediate(r));
    };

    for (const emp of empenhos) {
      const documento = readField(emp, "documento");
      if (!documento) continue;
      const ano = readNumberField(emp, "ano") ?? years[years.length - 1] ?? 0;
      const fase = readNumberField(emp, "fase") ?? 1;
      if (!includeDetails) {
        bulkRows.push({ documento, cnpj: normalizedCnpj, ano, fase, raw: emp });
        result.empenhos += 1;
        if (bulkRows.length >= BULK_BATCH) await flushBulk();
        continue;
      }
      this.portalRepo.upsertEmpenho(documento, normalizedCnpj, ano, fase, emp);
      result.empenhos += 1;

      if (includeDetails) {
        try {
          const detail = await this.portalClient.getEmpenhoDetails(documento);
          this.portalRepo.upsertEmpenhoDetail(documento, detail);
        } catch {
          // detail call frequently 404s for older empenhos — skip silently
        }
        try {
          const itens = await this.portalClient.getItensEmpenho(documento);
          this.portalRepo.replaceEmpenhoItens(documento, itens);
          for (const it of itens) {
            const sequencial = readNumberField(it, "sequencial");
            if (sequencial == null) continue;
            try {
              const hist = await this.portalClient.getItemHistorico(
                documento,
                sequencial,
              );
              this.portalRepo.replaceItemHistorico(documento, sequencial, hist);
            } catch {
              // historico endpoint often empty / 500s for old data
            }
          }
        } catch {
          // itens endpoint best-effort
        }
        try {
          const related = await this.portalClient.getDocumentosRelacionados(
            documento,
          );
          this.portalRepo.replaceDocumentosRelacionados(documento, 1, related);
        } catch {
          // relacionados best-effort
        }
      }
    }
    await flushBulk();

    if (includeSancoes) {
      try {
        const sancoes = await this.portalClient.getSancoesCnpj(normalizedCnpj);
        this.portalRepo.replaceSancoes(normalizedCnpj, "ceis", sancoes.ceis);
        this.portalRepo.replaceSancoes(normalizedCnpj, "cnep", sancoes.cnep);
      } catch {
        // sanctions are best-effort
      }
    }

    // Ensure pessoas_juridicas row exists so the UI can show last_portal_synced_at
    try {
      const pessoa = await this.portalClient.getPessoaJuridica(normalizedCnpj);
      this.syncRepo.upsertPessoaJuridica(normalizedCnpj, pessoa);
    } catch {
      // pessoa-juridica sometimes 500s for valid CNPJs; best-effort
    }
    this.portalRepo.markSupplierPortalSync(normalizedCnpj);

    if (result.failedSuppliers === 0) {
      result.suppliers = 1;
    }
    return result;
  }

  /**
   * Lazy-fetch detail (detail + itens + historico + relacionados) for one
   * empenho. Idempotent: if the bundle is already in the DB, returns it
   * without any HTTP calls. Used by the on-expand hover in the supplier
   * page so the manual sync button doesn't have to wait for the full
   * per-empenho fan-out.
   */
  async ensureEmpenhoDetail(documento: string): Promise<void> {
    try {
      const detail = await this.portalClient.getEmpenhoDetails(documento);
      this.portalRepo.upsertEmpenhoDetail(documento, detail);
    } catch {
      // detail call frequently 404s for older empenhos
    }
    try {
      const itens = await this.portalClient.getItensEmpenho(documento);
      this.portalRepo.replaceEmpenhoItens(documento, itens);
      for (const it of itens) {
        const seq = readNumberField(it, "sequencial");
        if (seq == null) continue;
        try {
          const hist = await this.portalClient.getItemHistorico(documento, seq);
          this.portalRepo.replaceItemHistorico(documento, seq, hist);
        } catch {
          // historico best-effort
        }
      }
    } catch {
      // itens best-effort
    }
    try {
      const related = await this.portalClient.getDocumentosRelacionados(
        documento,
      );
      this.portalRepo.replaceDocumentosRelacionados(documento, 1, related);
    } catch {
      // relacionados best-effort
    }
  }

  async syncArpSuppliers(
    numeroControlePncpAta: string,
    opts: PortalSyncOptions = {},
  ): Promise<PortalSyncResult> {
    const total: PortalSyncResult = {
      suppliers: 0,
      failedSuppliers: 0,
      contratos: 0,
      empenhos: 0,
    };
    const arp = this.syncRepo.findArp(numeroControlePncpAta);
    if (!arp) return total;

    const years = opts.years ?? this.yearsForArp(arp.raw);
    const cnpjs = this.portalRepo.findDistinctCnpjsForArp(numeroControlePncpAta);
    opts.progress?.setTotalSuppliers(cnpjs.length);

    for (const cnpj of cnpjs) {
      opts.progress?.startSupplier(cnpj);
      try {
        const r = await this.syncSupplier(cnpj, { ...opts, years });
        total.suppliers += r.suppliers;
        total.failedSuppliers += r.failedSuppliers;
        total.contratos += r.contratos;
        total.empenhos += r.empenhos;
        opts.progress?.supplierDone();
      } catch (err) {
        total.failedSuppliers += 1;
        opts.progress?.supplierFailed(err);
      }
    }
    return total;
  }

  async syncUasgSuppliers(
    codigoUasg: string,
    opts: PortalSyncOptions = {},
  ): Promise<PortalSyncResult> {
    const total: PortalSyncResult = {
      suppliers: 0,
      failedSuppliers: 0,
      contratos: 0,
      empenhos: 0,
    };
    const normalized = normalizeUasg(codigoUasg);
    const arps = this.syncRepo
      .findArpsByUasg(normalized)
      .map((r) => r.raw);
    if (arps.length === 0) return total;

    const years = opts.years ?? this.yearsForUasg(arps);
    const cnpjs = this.portalRepo.findDistinctCnpjsForUasg(normalized);
    opts.progress?.setTotalSuppliers(cnpjs.length);

    for (const cnpj of cnpjs) {
      opts.progress?.startSupplier(cnpj);
      try {
        const r = await this.syncSupplier(cnpj, { ...opts, years });
        total.suppliers += r.suppliers;
        total.failedSuppliers += r.failedSuppliers;
        total.contratos += r.contratos;
        total.empenhos += r.empenhos;
        opts.progress?.supplierDone();
      } catch (err) {
        total.failedSuppliers += 1;
        opts.progress?.supplierFailed(err);
      }
    }
    return total;
  }

  private yearsForArp(arp: Arp): number[] {
    const start = parseYear(arp.dataVigenciaInicial);
    const current = currentSpYear();
    if (start == null) return [current];
    return rangeInclusive(Math.min(start, current), current);
  }

  private yearsForUasg(arps: Arp[]): number[] {
    let earliest: number | null = null;
    for (const arp of arps) {
      const y = parseYear(arp.dataVigenciaInicial);
      if (y == null) continue;
      if (earliest == null || y < earliest) earliest = y;
    }
    const current = currentSpYear();
    if (earliest == null) return [current];
    return rangeInclusive(Math.min(earliest, current), current);
  }

  private defaultYears(): number[] {
    const current = currentSpYear();
    return [current - 2, current - 1, current];
  }
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  // ARP `dataVigenciaInicial` may arrive as "yyyy-mm-dd" or "dd/mm/yyyy"
  const isoMatch = /^(\d{4})/.exec(value);
  if (isoMatch) {
    const y = Number.parseInt(isoMatch[1]!, 10);
    return Number.isNaN(y) ? null : y;
  }
  const brMatch = /(\d{4})$/.exec(value);
  if (brMatch) {
    const y = Number.parseInt(brMatch[1]!, 10);
    return Number.isNaN(y) ? null : y;
  }
  return null;
}

function currentSpYear(): number {
  const formatted = SP_YEAR_FORMATTER.format(new Date());
  const value = Number.parseInt(formatted, 10);
  return Number.isNaN(value) ? new Date().getFullYear() : value;
}

function rangeInclusive(start: number, end: number): number[] {
  const out: number[] = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

function readField(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function readNumberField(obj: unknown, key: string): number | null {
  if (typeof obj !== "object" || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Number.parseInt(v, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isExpected404(err: unknown): boolean {
  return err instanceof PortalApiError && err.statusCode === 404;
}
