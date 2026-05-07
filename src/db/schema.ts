import type { AppDatabase } from "./connection.js";

export function initializeSchema(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uasgs (
      codigo_uasg TEXT PRIMARY KEY,
      nome_uasg TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_uasgs (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      codigo_uasg TEXT NOT NULL REFERENCES uasgs(codigo_uasg) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, codigo_uasg)
    );

    CREATE TABLE IF NOT EXISTS arps (
      numero_controle_pncp_ata TEXT PRIMARY KEY,
      codigo_uasg TEXT NOT NULL REFERENCES uasgs(codigo_uasg) ON DELETE CASCADE,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      last_empenhos_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS arp_items (
      numero_controle_pncp_ata TEXT NOT NULL REFERENCES arps(numero_controle_pncp_ata) ON DELETE CASCADE,
      numero_item TEXT NOT NULL,
      ni_fornecedor TEXT,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (numero_controle_pncp_ata, numero_item)
    );

    CREATE TABLE IF NOT EXISTS empenhos (
      id TEXT PRIMARY KEY,
      numero_controle_pncp_ata TEXT NOT NULL,
      numero_item TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      FOREIGN KEY (numero_controle_pncp_ata, numero_item)
        REFERENCES arp_items(numero_controle_pncp_ata, numero_item) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pessoas_juridicas (
      cnpj TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      codigo_uasg TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT,
      total_arps INTEGER NOT NULL DEFAULT 0,
      processed_arps INTEGER NOT NULL DEFAULT 0,
      failed_arps INTEGER NOT NULL DEFAULT 0,
      current_arp TEXT,
      current_arp_item_page INTEGER,
      current_arp_item_total_pages INTEGER,
      last_error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_month
      ON sync_jobs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
      ON sync_jobs(status, created_at);

    CREATE TABLE IF NOT EXISTS rate_limit_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      min_interval_ms INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO rate_limit_state (id, min_interval_ms, updated_at)
    VALUES (1, 1100, '1970-01-01T00:00:00Z');
  `);

  // Migrations for existing databases
  const arpCols = db.prepare("PRAGMA table_info(arps)").all() as { name: string }[];
  if (!arpCols.some((c) => c.name === "last_empenhos_synced_at")) {
    db.exec("ALTER TABLE arps ADD COLUMN last_empenhos_synced_at TEXT");
  }
}
