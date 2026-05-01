import type { Arp, ArpItem, ComprasGovClient } from "../clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../clients/portal-transparencia.js";
import {
  normalizeDigits,
  type SqliteSyncRepository,
} from "../db/sync-repository.js";
import { AuthError } from "./auth.js";
import { normalizeUasg } from "./user-uasgs.js";

export interface SyncResult {
  arps: number;
  items: number;
  pessoasJuridicas: number;
  empenhos: number;
}

export class UserDataSyncService {
  constructor(
    private readonly repository: SqliteSyncRepository,
    private readonly comprasClient: ComprasGovClient,
    private readonly portalClient: PortalTransparenciaClient,
  ) {}

  listArpsForUasg(codigoUasg: string): Arp[] {
    return this.repository
      .findArpsByUasg(normalizeUasg(codigoUasg))
      .map((r) => r.raw);
  }

  listItemsForArp(numeroControlePncpAta: string): ArpItem[] {
    return this.repository
      .findItemsByArp(numeroControlePncpAta)
      .map((r) => r.raw);
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

  async syncUasg(codigoUasg: string): Promise<SyncResult> {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    const result: SyncResult = {
      arps: 0,
      items: 0,
      pessoasJuridicas: 0,
      empenhos: 0,
    };

    // Phase 1: fetch and persist all ARPs before touching items
    const arps =
      await this.comprasClient.consultarArpsPorUnidadeGerenciadora(
        normalizedCodigoUasg,
      );
    for (const arp of arps) {
      this.repository.upsertArp(normalizedCodigoUasg, arp);
      result.arps += 1;
    }

    // Phase 2: fetch items only — empenhos/suppliers fetched on-demand via refresh endpoints
    // Skip ARPs that already have items so a retry resumes from where it left off
    for (const arp of arps) {
      const alreadySynced =
        this.repository.countItemsByArp(arp.numeroControlePncpAta) >=
        (arp.quantidadeItens ?? 0);
      if (!alreadySynced) {
        result.items += await this.saveItemsForArp(arp.numeroControlePncpAta);
      }
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

  async refreshArp(numeroControlePncpAta: string): Promise<SyncResult> {
    const storedArp = this.repository.findArp(numeroControlePncpAta);
    if (!storedArp) {
      throw new Error("ARP not found");
    }

    const arps = await this.comprasClient.consultarArpsPorUnidadeGerenciadora(
      storedArp.codigoUasg,
    );
    const refreshedArp =
      arps.find((arp) => arp.numeroControlePncpAta === numeroControlePncpAta) ??
      storedArp.raw;
    this.repository.upsertArp(storedArp.codigoUasg, refreshedArp);

    const itemResult = await this.refreshItemsForArp(numeroControlePncpAta);
    return { arps: 1, ...itemResult };
  }

  async refreshItem(
    numeroControlePncpAta: string,
    numeroItem: string,
  ): Promise<SyncResult> {
    const item = await this.fetchItem(numeroControlePncpAta, numeroItem);
    this.repository.upsertArpItem(numeroControlePncpAta, item);
    const pessoasJuridicas = await this.refreshSupplier(item);
    const empenhos = await this.refreshEmpenhos(numeroControlePncpAta, item);
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
    const empenhos = await this.refreshEmpenhos(
      numeroControlePncpAta,
      storedItem.raw,
    );
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
  ): Promise<number> {
    const items = await this.comprasClient.consultarItensDaArp(
      numeroControlePncpAta,
    );
    for (const item of items) {
      this.repository.upsertArpItem(numeroControlePncpAta, item);
    }
    return items.length;
  }

  private async refreshItemsForArp(
    numeroControlePncpAta: string,
  ): Promise<Omit<SyncResult, "arps">> {
    const result = { items: 0, pessoasJuridicas: 0, empenhos: 0 };
    const items = await this.comprasClient.consultarItensDaArp(
      numeroControlePncpAta,
    );
    for (const item of items) {
      this.repository.upsertArpItem(numeroControlePncpAta, item);
      result.items += 1;
      result.pessoasJuridicas += await this.refreshSupplier(item);
      result.empenhos += await this.refreshEmpenhos(
        numeroControlePncpAta,
        item,
      );
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

  private async refreshEmpenhos(
    numeroControlePncpAta: string,
    item: ArpItem,
  ): Promise<number> {
    if (!this.comprasClient.consultarEmpenhosSaldoItem) {
      return 0;
    }

    const storedArp = this.repository.findArp(numeroControlePncpAta);
    const numeroAta =
      item.numeroAtaRegistroPreco ?? storedArp?.raw.numeroAtaRegistroPreco;
    const unidadeGerenciadora =
      item.codigoUnidadeGerenciadora ?? storedArp?.codigoUasg;

    if (!numeroAta || !unidadeGerenciadora) {
      return 0;
    }

    const empenhos = await this.comprasClient.consultarEmpenhosSaldoItem(
      numeroAta,
      unidadeGerenciadora,
    );
    let count = 0;
    for (const empenho of empenhos) {
      this.repository.upsertEmpenho(
        buildEmpenhoId(numeroControlePncpAta, item.numeroItem, empenho, count),
        numeroControlePncpAta,
        item.numeroItem,
        empenho,
      );
      count += 1;
    }
    return count;
  }
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
