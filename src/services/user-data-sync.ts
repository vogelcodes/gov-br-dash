import type { SqliteDatabase } from "../db/sqlite.js";
import type { ArpComItens } from "../clients/compras-gov.js";
import type { ArpsService } from "./arps.js";
import type { PessoasService } from "./pessoas.js";

export interface UserDataSyncSummary {
  codigoUasg: string;
  arps: number;
  items: number;
  cnpjs: number;
}

export class SqliteUserDataSyncRepository {
  constructor(private readonly db: SqliteDatabase) {}

  userHasUasg(userId: string, codigoUasg: string): boolean {
    const row = this.db
      .prepare("select 1 from user_uasgs where user_id = ? and codigo_uasg = ?")
      .get(userId, codigoUasg);
    return Boolean(row);
  }

  saveArpWithItems(arp: ArpComItens, codigoUasg: string, syncedAt: string): void {
    this.db
      .prepare(
        `insert into arps (numero_controle_pncp_ata, codigo_uasg, raw_json, last_synced_at)
         values (?, ?, ?, ?)
         on conflict(numero_controle_pncp_ata) do update set
           codigo_uasg = excluded.codigo_uasg,
           raw_json = excluded.raw_json,
           last_synced_at = excluded.last_synced_at`,
      )
      .run(arp.numeroControlePncpAta, codigoUasg, JSON.stringify(arp), syncedAt);

    for (const item of arp.itens) {
      this.db
        .prepare(
          `insert into arp_items (numero_controle_pncp_ata, numero_item, ni_fornecedor, raw_json, last_synced_at)
           values (?, ?, ?, ?, ?)
           on conflict(numero_controle_pncp_ata, numero_item) do update set
             ni_fornecedor = excluded.ni_fornecedor,
             raw_json = excluded.raw_json,
             last_synced_at = excluded.last_synced_at`,
        )
        .run(
          arp.numeroControlePncpAta,
          item.numeroItem,
          item.niFornecedor ?? null,
          JSON.stringify(item),
          syncedAt,
        );
    }
  }

  saveCnpj(cnpj: string, data: unknown, syncedAt: string): void {
    this.db
      .prepare(
        `insert into cnpjs (cnpj, raw_json, last_synced_at)
         values (?, ?, ?)
         on conflict(cnpj) do update set
           raw_json = excluded.raw_json,
           last_synced_at = excluded.last_synced_at`,
      )
      .run(cnpj, JSON.stringify(data), syncedAt);
  }
}

export class UserDataSyncService {
  constructor(
    private readonly repository: SqliteUserDataSyncRepository,
    private readonly arps: ArpsService,
    private readonly pessoas: PessoasService,
  ) {}

  async syncUasgForUser(userId: string, codigoUasg: string): Promise<UserDataSyncSummary> {
    const normalizedCodigoUasg = codigoUasg.replace(/\D/g, "");
    if (!this.repository.userHasUasg(userId, normalizedCodigoUasg)) {
      throw new Error("UASG not linked to user");
    }

    const syncedAt = new Date().toISOString();
    const arps = await this.arps.consultarArpsPorUasg(normalizedCodigoUasg);
    const cnpjs = new Set<string>();
    let items = 0;

    for (const arp of arps) {
      this.repository.saveArpWithItems(arp, normalizedCodigoUasg, syncedAt);
      items += arp.itens.length;
      for (const item of arp.itens) {
        const cnpj = item.niFornecedor?.replace(/\D/g, "");
        if (cnpj?.length === 14) {
          cnpjs.add(cnpj);
        }
      }
    }

    for (const cnpj of cnpjs) {
      this.repository.saveCnpj(cnpj, await this.pessoas.consultarPessoaJuridica(cnpj), syncedAt);
    }

    return { codigoUasg: normalizedCodigoUasg, arps: arps.length, items, cnpjs: cnpjs.size };
  }
}
