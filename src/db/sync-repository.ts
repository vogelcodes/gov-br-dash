import type { Arp, ArpItem } from "../clients/compras-gov.js";
import type { AppDatabase } from "./connection.js";

export interface StoredJsonRecord<T = unknown> {
  raw: T;
  lastSyncedAt: string;
}

export interface StoredArpRecord extends StoredJsonRecord<Arp> {
  codigoUasg: string;
}

export class SqliteSyncRepository {
  constructor(private readonly db: AppDatabase) {}

  upsertArp(codigoUasg: string, arp: Arp): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO arps (numero_controle_pncp_ata, codigo_uasg, raw_json, last_synced_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(numero_controle_pncp_ata) DO UPDATE SET
        codigo_uasg = excluded.codigo_uasg,
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(arp.numeroControlePncpAta, codigoUasg, JSON.stringify(arp), now);
  }

  upsertArpItem(numeroControlePncpAta: string, item: ArpItem): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO arp_items (numero_controle_pncp_ata, numero_item, ni_fornecedor, raw_json, last_synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(numero_controle_pncp_ata, numero_item) DO UPDATE SET
        ni_fornecedor = excluded.ni_fornecedor,
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(
        numeroControlePncpAta,
        item.numeroItem,
        normalizeDigits(item.niFornecedor),
        JSON.stringify(item),
        now,
      );
  }

  upsertPessoaJuridica(cnpj: string, raw: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO pessoas_juridicas (cnpj, raw_json, last_synced_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cnpj) DO UPDATE SET
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(normalizeDigits(cnpj), JSON.stringify(raw), now);
  }

  upsertEmpenho(
    id: string,
    numeroControlePncpAta: string,
    numeroItem: string,
    raw: unknown,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO empenhos (id, numero_controle_pncp_ata, numero_item, raw_json, last_synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(id, numeroControlePncpAta, numeroItem, JSON.stringify(raw), now);
  }

  markEmpenhosSync(numeroControlePncpAta: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE arps SET last_empenhos_synced_at = ? WHERE numero_controle_pncp_ata = ?",
      )
      .run(now, numeroControlePncpAta);
  }

  /**
   * Per-ARP roll-up: ARP metadata + counts and freshness for items + empenhos.
   * One query so the dashboard sidebar can render accurate badges for every
   * ARP in a UASG without making N detail requests.
   */
  findArpsSummaryByUasg(codigoUasg: string): {
    arp: Arp;
    itemCount: number;
    empenhoCount: number;
    lastSyncedAt: string;
    lastItemsSyncedAt: string | null;
    lastEmpenhosSyncedAt: string | null;
  }[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        a.raw_json,
        a.last_synced_at,
        (SELECT COUNT(*) FROM arp_items i WHERE i.numero_controle_pncp_ata = a.numero_controle_pncp_ata) AS item_count,
        (SELECT COUNT(*) FROM empenhos e WHERE e.numero_controle_pncp_ata = a.numero_controle_pncp_ata) AS empenho_count,
        (SELECT MAX(i.last_synced_at) FROM arp_items i WHERE i.numero_controle_pncp_ata = a.numero_controle_pncp_ata) AS last_items_synced_at,
        a.last_empenhos_synced_at
      FROM arps a
      WHERE a.codigo_uasg = ?
      ORDER BY a.last_synced_at DESC
    `,
      )
      .all(codigoUasg) as {
      raw_json: string;
      last_synced_at: string;
      item_count: number;
      empenho_count: number;
      last_items_synced_at: string | null;
      last_empenhos_synced_at: string | null;
    }[];
    return rows.map((row) => ({
      arp: JSON.parse(row.raw_json) as Arp,
      itemCount: row.item_count,
      empenhoCount: row.empenho_count,
      lastSyncedAt: row.last_synced_at,
      lastItemsSyncedAt: row.last_items_synced_at,
      lastEmpenhosSyncedAt: row.last_empenhos_synced_at,
    }));
  }

  findArpsByUasg(codigoUasg: string): StoredArpRecord[] {
    const rows = this.db
      .prepare(
        "SELECT codigo_uasg, raw_json, last_synced_at FROM arps WHERE codigo_uasg = ? ORDER BY last_synced_at DESC",
      )
      .all(codigoUasg) as {
      codigo_uasg: string;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      codigoUasg: row.codigo_uasg,
      raw: JSON.parse(row.raw_json) as Arp,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  countItemsByArp(numeroControlePncpAta: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM arp_items WHERE numero_controle_pncp_ata = ?",
      )
      .get(numeroControlePncpAta) as { count: number };
    return row.count;
  }

  findItemsByArp(numeroControlePncpAta: string): StoredJsonRecord<ArpItem>[] {
    const rows = this.db
      .prepare(
        "SELECT raw_json, last_synced_at FROM arp_items WHERE numero_controle_pncp_ata = ? ORDER BY CAST(numero_item AS INTEGER)",
      )
      .all(numeroControlePncpAta) as {
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      raw: JSON.parse(row.raw_json) as ArpItem,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  findArp(numeroControlePncpAta: string): StoredArpRecord | null {
    const row = this.db
      .prepare(
        "SELECT codigo_uasg, raw_json, last_synced_at FROM arps WHERE numero_controle_pncp_ata = ?",
      )
      .get(numeroControlePncpAta) as
      | { codigo_uasg: string; raw_json: string; last_synced_at: string }
      | undefined;
    return row
      ? {
          codigoUasg: row.codigo_uasg,
          raw: JSON.parse(row.raw_json) as Arp,
          lastSyncedAt: row.last_synced_at,
        }
      : null;
  }

  findArpForUasg(
    numeroControlePncpAta: string,
    codigoUasg: string,
  ): StoredJsonRecord<Arp> | null {
    const row = this.db
      .prepare(
        "SELECT raw_json, last_synced_at FROM arps WHERE numero_controle_pncp_ata = ? AND codigo_uasg = ?",
      )
      .get(numeroControlePncpAta, codigoUasg) as
      | { raw_json: string; last_synced_at: string }
      | undefined;
    return row
      ? {
          raw: JSON.parse(row.raw_json) as Arp,
          lastSyncedAt: row.last_synced_at,
        }
      : null;
  }

  findItem(
    numeroControlePncpAta: string,
    numeroItem: string,
  ): StoredJsonRecord<ArpItem> | null {
    const row = this.db
      .prepare(
        "SELECT raw_json, last_synced_at FROM arp_items WHERE numero_controle_pncp_ata = ? AND numero_item = ?",
      )
      .get(numeroControlePncpAta, numeroItem) as
      | { raw_json: string; last_synced_at: string }
      | undefined;
    return row
      ? {
          raw: JSON.parse(row.raw_json) as ArpItem,
          lastSyncedAt: row.last_synced_at,
        }
      : null;
  }

  deleteEmpenhosByArp(numeroControlePncpAta: string): void {
    this.db
      .prepare("DELETE FROM empenhos WHERE numero_controle_pncp_ata = ?")
      .run(numeroControlePncpAta);
  }

  findEmpenhosByArp(
    numeroControlePncpAta: string,
  ): { numeroItem: string; raw: unknown; lastSyncedAt: string }[] {
    const rows = this.db
      .prepare(
        "SELECT numero_item, raw_json, last_synced_at FROM empenhos WHERE numero_controle_pncp_ata = ? ORDER BY CAST(numero_item AS INTEGER)",
      )
      .all(numeroControlePncpAta) as {
      numero_item: string;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      numeroItem: row.numero_item,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  findPessoasJuridicasByArp(
    numeroControlePncpAta: string,
  ): { cnpj: string; raw: unknown; lastSyncedAt: string }[] {
    const rows = this.db
      .prepare(
        `
      SELECT pj.cnpj, pj.raw_json, pj.last_synced_at
      FROM pessoas_juridicas pj
      INNER JOIN arp_items ai ON ai.ni_fornecedor = pj.cnpj
      WHERE ai.numero_controle_pncp_ata = ?
      GROUP BY pj.cnpj
    `,
      )
      .all(numeroControlePncpAta) as {
      cnpj: string;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      cnpj: row.cnpj,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  findPessoaJuridica(cnpj: string): StoredJsonRecord | null {
    const row = this.db
      .prepare(
        "SELECT raw_json, last_synced_at FROM pessoas_juridicas WHERE cnpj = ?",
      )
      .get(normalizeDigits(cnpj)) as
      | { raw_json: string; last_synced_at: string }
      | undefined;
    return row
      ? {
          raw: JSON.parse(row.raw_json) as unknown,
          lastSyncedAt: row.last_synced_at,
        }
      : null;
  }

  userOwnsUasg(userId: string, codigoUasg: string): boolean {
    const row = this.db
      .prepare(
        `
      SELECT 1
      FROM user_uasgs
      WHERE user_id = ? AND codigo_uasg = ?
      LIMIT 1
    `,
      )
      .get(userId, codigoUasg);
    return row !== undefined;
  }

  userOwnsArp(userId: string, numeroControlePncpAta: string): boolean {
    const row = this.db
      .prepare(
        `
      SELECT 1
      FROM user_uasgs uu
      INNER JOIN arps a ON a.codigo_uasg = uu.codigo_uasg
      WHERE uu.user_id = ? AND a.numero_controle_pncp_ata = ?
      LIMIT 1
    `,
      )
      .get(userId, numeroControlePncpAta);
    return row !== undefined;
  }

  userOwnsItem(
    userId: string,
    numeroControlePncpAta: string,
    numeroItem: string,
  ): boolean {
    const row = this.db
      .prepare(
        `
      SELECT 1
      FROM user_uasgs uu
      INNER JOIN arps a ON a.codigo_uasg = uu.codigo_uasg
      INNER JOIN arp_items ai ON ai.numero_controle_pncp_ata = a.numero_controle_pncp_ata
      WHERE uu.user_id = ? AND a.numero_controle_pncp_ata = ? AND ai.numero_item = ?
      LIMIT 1
    `,
      )
      .get(userId, numeroControlePncpAta, numeroItem);
    return row !== undefined;
  }

  userOwnsPessoaJuridica(userId: string, cnpj: string): boolean {
    const normalizedCnpj = normalizeDigits(cnpj);
    if (!normalizedCnpj) {
      return false;
    }
    const row = this.db
      .prepare(
        `
      SELECT 1
      FROM user_uasgs uu
      INNER JOIN arps a ON a.codigo_uasg = uu.codigo_uasg
      INNER JOIN arp_items ai ON ai.numero_controle_pncp_ata = a.numero_controle_pncp_ata
      WHERE uu.user_id = ? AND ai.ni_fornecedor = ?
      LIMIT 1
    `,
      )
      .get(userId, normalizedCnpj);
    return row !== undefined;
  }
}

export function normalizeDigits(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
