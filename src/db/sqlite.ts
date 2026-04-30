import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export function createSqliteDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: SqliteDatabase): void {
  db.exec(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      email_verified integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at text not null,
      revoked_at text,
      created_at text not null
    );

    create table if not exists uasgs (
      codigo_uasg text primary key,
      nome_uasg text not null,
      raw_json text not null,
      last_synced_at text not null
    );

    create table if not exists user_uasgs (
      user_id text not null references users(id) on delete cascade,
      codigo_uasg text not null references uasgs(codigo_uasg) on delete cascade,
      linked_at text not null,
      primary key (user_id, codigo_uasg)
    );

    create table if not exists arps (
      numero_controle_pncp_ata text primary key,
      codigo_uasg text not null,
      raw_json text not null,
      last_synced_at text not null
    );

    create table if not exists arp_items (
      numero_controle_pncp_ata text not null,
      numero_item text not null,
      ni_fornecedor text,
      raw_json text not null,
      last_synced_at text not null,
      primary key (numero_controle_pncp_ata, numero_item),
      foreign key (numero_controle_pncp_ata) references arps(numero_controle_pncp_ata) on delete cascade
    );

    create table if not exists empenhos (
      id text primary key,
      numero_controle_pncp_ata text not null,
      numero_item text not null,
      raw_json text not null,
      last_synced_at text not null
    );

    create table if not exists cnpjs (
      cnpj text primary key,
      raw_json text not null,
      last_synced_at text not null
    );
  `);
}
