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
      last_synced_at TEXT NOT NULL,
      last_changed_at TEXT
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
      last_empenhos_synced_at TEXT,
      last_changed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS arp_items (
      numero_controle_pncp_ata TEXT NOT NULL REFERENCES arps(numero_controle_pncp_ata) ON DELETE CASCADE,
      numero_item TEXT NOT NULL,
      ni_fornecedor TEXT,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      last_changed_at TEXT,
      PRIMARY KEY (numero_controle_pncp_ata, numero_item)
    );

    CREATE TABLE IF NOT EXISTS empenhos (
      id TEXT PRIMARY KEY,
      numero_controle_pncp_ata TEXT NOT NULL,
      numero_item TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      last_changed_at TEXT,
      FOREIGN KEY (numero_controle_pncp_ata, numero_item)
        REFERENCES arp_items(numero_controle_pncp_ata, numero_item) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pessoas_juridicas (
      cnpj TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      last_changed_at TEXT
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
      finished_at TEXT,
      priority INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS portal_empenhos (
      documento TEXT PRIMARY KEY,
      cnpj TEXT NOT NULL,
      ano INTEGER NOT NULL,
      fase INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portal_empenhos_cnpj ON portal_empenhos(cnpj);

    CREATE TABLE IF NOT EXISTS portal_empenho_details (
      documento TEXT PRIMARY KEY REFERENCES portal_empenhos(documento) ON DELETE CASCADE,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_empenho_itens (
      documento TEXT NOT NULL,
      sequencial INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (documento, sequencial),
      FOREIGN KEY (documento) REFERENCES portal_empenhos(documento) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS portal_empenho_historico (
      documento TEXT NOT NULL,
      sequencial INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (documento, sequencial, idx)
    );

    CREATE TABLE IF NOT EXISTS portal_documentos_relacionados (
      documento TEXT NOT NULL,
      related_documento TEXT NOT NULL,
      fase INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (documento, related_documento, fase)
    );

    CREATE TABLE IF NOT EXISTS portal_sancoes (
      cnpj TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('ceis','cnep')),
      idx INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      PRIMARY KEY (cnpj, source, idx)
    );

    CREATE TABLE IF NOT EXISTS portal_contratos (
      contrato_id TEXT PRIMARY KEY,
      cnpj TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      last_synced_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portal_contratos_cnpj ON portal_contratos(cnpj);
  `);

  // Migrations for existing databases
  const arpCols = db.prepare("PRAGMA table_info(arps)").all() as { name: string }[];
  if (!arpCols.some((c) => c.name === "last_empenhos_synced_at")) {
    db.exec("ALTER TABLE arps ADD COLUMN last_empenhos_synced_at TEXT");
  }

  const pessoaCols = db
    .prepare("PRAGMA table_info(pessoas_juridicas)")
    .all() as { name: string }[];
  if (!pessoaCols.some((c) => c.name === "last_portal_synced_at")) {
    db.exec(
      "ALTER TABLE pessoas_juridicas ADD COLUMN last_portal_synced_at TEXT",
    );
  }

  const syncJobCols = db
    .prepare("PRAGMA table_info(sync_jobs)")
    .all() as { name: string }[];
  if (!syncJobCols.some((c) => c.name === "kind")) {
    db.exec(
      "ALTER TABLE sync_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'uasg'",
    );
  }
  if (!syncJobCols.some((c) => c.name === "target_id")) {
    // For portal-supplier-arp jobs we need to remember the ARP target;
    // codigo_uasg alone is insufficient.
    db.exec("ALTER TABLE sync_jobs ADD COLUMN target_id TEXT");
  }

  // priority lane for sync_jobs: higher numbers run first. User-triggered jobs
  // get 10, red bg refreshes 5, yellow bg refreshes 1.
  if (!syncJobCols.some((c) => c.name === "priority")) {
    db.exec(
      "ALTER TABLE sync_jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
    );
  }

  // last_changed_at: bumped on upsert only when raw_json actually differs.
  // Drives staleness UI + auto-refresh scheduling.
  for (const table of [
    "uasgs",
    "arps",
    "arp_items",
    "empenhos",
    "pessoas_juridicas",
  ]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "last_changed_at")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN last_changed_at TEXT`);
      db.exec(
        `UPDATE ${table} SET last_changed_at = last_synced_at WHERE last_changed_at IS NULL`,
      );
    }
  }
}
