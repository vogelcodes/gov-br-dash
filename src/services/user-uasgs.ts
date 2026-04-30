import type { SqliteDatabase } from "../db/sqlite.js";
import type { Uasg } from "../clients/compras-gov.js";
import type { UasgService } from "./uasg.js";

export interface LinkedUasg {
  codigoUasg: string;
  nomeUasg: string;
  linkedAt: string;
}

interface LinkedUasgRow {
  codigo_uasg: string;
  nome_uasg: string;
  linked_at: string;
}

export class SqliteUserUasgRepository {
  constructor(private readonly db: SqliteDatabase) {}

  list(userId: string): LinkedUasg[] {
    const rows = this.db
      .prepare(
        `select uasgs.codigo_uasg, uasgs.nome_uasg, user_uasgs.linked_at
         from user_uasgs
         join uasgs on uasgs.codigo_uasg = user_uasgs.codigo_uasg
         where user_uasgs.user_id = ?
         order by user_uasgs.linked_at asc`,
      )
      .all(userId) as LinkedUasgRow[];
    return rows.map(mapLinkedRow);
  }

  count(userId: string): number {
    const row = this.db
      .prepare("select count(*) as count from user_uasgs where user_id = ?")
      .get(userId) as { count: number };
    return row.count;
  }

  saveUasg(uasg: Uasg, syncedAt: string): void {
    this.db
      .prepare(
        `insert into uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at)
         values (?, ?, ?, ?)
         on conflict(codigo_uasg) do update set
           nome_uasg = excluded.nome_uasg,
           raw_json = excluded.raw_json,
           last_synced_at = excluded.last_synced_at`,
      )
      .run(uasg.codigoUasg, uasg.nomeUasg, JSON.stringify(uasg), syncedAt);
  }

  link(userId: string, codigoUasg: string, linkedAt: string): LinkedUasg {
    this.db
      .prepare(
        `insert or ignore into user_uasgs (user_id, codigo_uasg, linked_at)
         values (?, ?, ?)`,
      )
      .run(userId, codigoUasg, linkedAt);

    const row = this.db
      .prepare(
        `select uasgs.codigo_uasg, uasgs.nome_uasg, user_uasgs.linked_at
         from user_uasgs
         join uasgs on uasgs.codigo_uasg = user_uasgs.codigo_uasg
         where user_uasgs.user_id = ? and user_uasgs.codigo_uasg = ?`,
      )
      .get(userId, codigoUasg) as LinkedUasgRow;
    return mapLinkedRow(row);
  }

  remove(userId: string, codigoUasg: string): void {
    this.db
      .prepare("delete from user_uasgs where user_id = ? and codigo_uasg = ?")
      .run(userId, codigoUasg);
  }
}

export class UserUasgService {
  constructor(
    private readonly repository: SqliteUserUasgRepository,
    private readonly uasgService: UasgService,
  ) {}

  async listForUser(userId: string): Promise<LinkedUasg[]> {
    return this.repository.list(userId);
  }

  async addForUser(userId: string, codigoUasg: string): Promise<LinkedUasg> {
    const normalized = normalizeUasg(codigoUasg);
    const existing = this.repository
      .list(userId)
      .find((uasg) => uasg.codigoUasg === normalized);
    if (existing) {
      return existing;
    }
    if (this.repository.count(userId) >= 3) {
      throw new Error("UASG limit reached");
    }

    const uasg = await this.uasgService.consultarUasg(normalized);
    if (!uasg) {
      throw new Error("UASG not found");
    }

    const now = new Date().toISOString();
    this.repository.saveUasg({ ...uasg, codigoUasg: normalized }, now);
    return this.repository.link(userId, normalized, now);
  }

  async removeForUser(userId: string, codigoUasg: string): Promise<void> {
    this.repository.remove(userId, normalizeUasg(codigoUasg));
  }
}

function normalizeUasg(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length !== 6) {
    throw new Error("codigoUasg must contain 6 digits");
  }
  return normalized;
}

function mapLinkedRow(row: LinkedUasgRow): LinkedUasg {
  return {
    codigoUasg: row.codigo_uasg,
    nomeUasg: row.nome_uasg,
    linkedAt: row.linked_at,
  };
}
