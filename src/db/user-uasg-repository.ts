import type { Uasg } from "../clients/compras-gov.js";
import type { AppDatabase } from "./connection.js";

export interface LinkedUasgRecord {
  codigoUasg: string;
  nomeUasg: string;
  raw: Uasg;
  linkedAt: string;
  lastSyncedAt: string;
}

interface LinkedUasgRow {
  codigo_uasg: string;
  nome_uasg: string;
  raw_json: string;
  linked_at: string;
  last_synced_at: string;
}

export class SqliteUserUasgRepository {
  constructor(private readonly db: AppDatabase) {}

  countForUser(userId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM user_uasgs WHERE user_id = ?").get(userId) as { count: number };
    return row.count;
  }

  listForUser(userId: string): LinkedUasgRecord[] {
    const rows = this.db.prepare(`
      SELECT u.codigo_uasg, u.nome_uasg, u.raw_json, uu.created_at AS linked_at, u.last_synced_at
      FROM user_uasgs uu
      JOIN uasgs u ON u.codigo_uasg = uu.codigo_uasg
      WHERE uu.user_id = ?
      ORDER BY uu.created_at ASC
    `).all(userId) as LinkedUasgRow[];
    return rows.map((row) => ({
      codigoUasg: row.codigo_uasg,
      nomeUasg: row.nome_uasg,
      raw: JSON.parse(row.raw_json) as Uasg,
      linkedAt: row.linked_at,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  userHasUasg(userId: string, codigoUasg: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM user_uasgs WHERE user_id = ? AND codigo_uasg = ?").get(userId, codigoUasg);
    return row !== undefined;
  }

  linkUasg(userId: string, uasg: Uasg): LinkedUasgRecord {
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at)
        VALUES (@codigoUasg, @nomeUasg, @rawJson, @lastSyncedAt)
        ON CONFLICT(codigo_uasg) DO UPDATE SET
          nome_uasg = excluded.nome_uasg,
          raw_json = excluded.raw_json,
          last_synced_at = excluded.last_synced_at
      `).run({
        codigoUasg: uasg.codigoUasg,
        nomeUasg: uasg.nomeUasg,
        rawJson: JSON.stringify(uasg),
        lastSyncedAt: now,
      });
      this.db.prepare(`
        INSERT OR IGNORE INTO user_uasgs (user_id, codigo_uasg, created_at)
        VALUES (?, ?, ?)
      `).run(userId, uasg.codigoUasg, now);
    });
    insert();
    return {
      codigoUasg: uasg.codigoUasg,
      nomeUasg: uasg.nomeUasg,
      raw: uasg,
      linkedAt: now,
      lastSyncedAt: now,
    };
  }

  unlinkUasg(userId: string, codigoUasg: string): boolean {
    const result = this.db.prepare("DELETE FROM user_uasgs WHERE user_id = ? AND codigo_uasg = ?").run(userId, codigoUasg);
    return result.changes > 0;
  }
}
