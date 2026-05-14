import type { AppDatabase } from "./connection.js";
import { normalizeDigits } from "./sync-repository.js";

const DB_TIMING_ENABLED = process.env.DEBUG_DB_TIMING === "1";
const DB_TIMING_THRESHOLD_MS = Number(
  process.env.DEBUG_DB_TIMING_MS ?? "50",
);

function timed<T>(label: string, rowCount: number, fn: () => T): T {
  if (!DB_TIMING_ENABLED) return fn();
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  if (ms >= DB_TIMING_THRESHOLD_MS) {
    console.warn(
      `[db-timing] ${label} rows=${rowCount} ${ms.toFixed(1)}ms`,
    );
  }
  return result;
}

export interface PortalEmpenhoRow {
  documento: string;
  cnpj: string;
  ano: number;
  fase: number;
  raw: unknown;
  lastSyncedAt: string;
}

export interface PortalEmpenhoBundle {
  documento: string;
  empenho: unknown;
  detail: unknown | null;
  itens: { sequencial: number; raw: unknown }[];
  historico: { sequencial: number; idx: number; raw: unknown }[];
  relacionados: { related: string; fase: number; raw: unknown }[];
}

export interface PortalContratoRow {
  contratoId: string;
  cnpj: string;
  raw: unknown;
  lastSyncedAt: string;
}

export interface PortalSancaoRow {
  cnpj: string;
  source: "ceis" | "cnep";
  idx: number;
  raw: unknown;
  lastSyncedAt: string;
}

export class SqlitePortalDataRepository {
  constructor(private readonly db: AppDatabase) {}

  upsertEmpenho(
    documento: string,
    cnpj: string,
    ano: number,
    fase: number,
    raw: unknown,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO portal_empenhos (documento, cnpj, ano, fase, raw_json, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(documento) DO UPDATE SET
        cnpj = excluded.cnpj,
        ano = excluded.ano,
        fase = excluded.fase,
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(
        documento,
        normalizeDigits(cnpj) ?? cnpj,
        ano,
        fase,
        JSON.stringify(raw),
        now,
      );
  }

  /**
   * Bulk upsert empenhos in one transaction. Faster than calling
   * upsertEmpenho in a loop (single prepared statement, single fsync) and —
   * critically — caller can `await` between batches to keep the Fastify
   * event loop responsive while a sync job is running. See
   * tests/integration/sync-responsiveness.test.ts.
   */
  bulkUpsertEmpenhos(
    rows: { documento: string; cnpj: string; ano: number; fase: number; raw: unknown }[],
  ): void {
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO portal_empenhos (documento, cnpj, ano, fase, raw_json, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(documento) DO UPDATE SET
         cnpj = excluded.cnpj,
         ano = excluded.ano,
         fase = excluded.fase,
         raw_json = excluded.raw_json,
         last_synced_at = excluded.last_synced_at`,
    );
    const tx = this.db.transaction(
      (
        items: { documento: string; cnpj: string; ano: number; fase: number; raw: unknown }[],
      ) => {
        for (const r of items) {
          insert.run(
            r.documento,
            normalizeDigits(r.cnpj) ?? r.cnpj,
            r.ano,
            r.fase,
            JSON.stringify(r.raw),
            now,
          );
        }
      },
    );
    timed("bulkUpsertEmpenhos", rows.length, () => tx(rows));
  }

  upsertEmpenhoDetail(documento: string, raw: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO portal_empenho_details (documento, raw_json, last_synced_at)
      VALUES (?, ?, ?)
      ON CONFLICT(documento) DO UPDATE SET
        raw_json = excluded.raw_json,
        last_synced_at = excluded.last_synced_at
    `,
      )
      .run(documento, JSON.stringify(raw), now);
  }

  replaceEmpenhoItens(documento: string, itens: unknown[]): void {
    const now = new Date().toISOString();
    const tx = this.db.transaction((rows: unknown[]) => {
      this.db
        .prepare("DELETE FROM portal_empenho_itens WHERE documento = ?")
        .run(documento);
      const insert = this.db.prepare(
        `INSERT INTO portal_empenho_itens (documento, sequencial, raw_json, last_synced_at)
         VALUES (?, ?, ?, ?)`,
      );
      rows.forEach((row, idx) => {
        const seq = readSequencial(row, idx + 1);
        insert.run(documento, seq, JSON.stringify(row), now);
      });
    });
    timed("replaceEmpenhoItens", itens.length, () => tx(itens));
  }

  replaceItemHistorico(
    documento: string,
    sequencial: number,
    entries: unknown[],
  ): void {
    const now = new Date().toISOString();
    const tx = this.db.transaction((rows: unknown[]) => {
      this.db
        .prepare(
          "DELETE FROM portal_empenho_historico WHERE documento = ? AND sequencial = ?",
        )
        .run(documento, sequencial);
      const insert = this.db.prepare(
        `INSERT INTO portal_empenho_historico (documento, sequencial, idx, raw_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      rows.forEach((row, idx) => {
        insert.run(documento, sequencial, idx, JSON.stringify(row), now);
      });
    });
    timed("replaceItemHistorico", entries.length, () => tx(entries));
  }

  replaceDocumentosRelacionados(
    documento: string,
    fase: number,
    related: unknown[],
  ): void {
    const now = new Date().toISOString();
    const tx = this.db.transaction((rows: unknown[]) => {
      this.db
        .prepare(
          "DELETE FROM portal_documentos_relacionados WHERE documento = ? AND fase = ?",
        )
        .run(documento, fase);
      const insert = this.db.prepare(
        `INSERT INTO portal_documentos_relacionados (documento, related_documento, fase, raw_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      rows.forEach((row, idx) => {
        const relatedDoc = readRelatedDocumento(row) ?? `${documento}:${idx}`;
        insert.run(
          documento,
          relatedDoc,
          fase,
          JSON.stringify(row),
          now,
        );
      });
    });
    timed("replaceDocumentosRelacionados", related.length, () => tx(related));
  }

  replaceSancoes(
    cnpj: string,
    source: "ceis" | "cnep",
    list: unknown[],
  ): void {
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    const now = new Date().toISOString();
    const tx = this.db.transaction((rows: unknown[]) => {
      this.db
        .prepare(
          "DELETE FROM portal_sancoes WHERE cnpj = ? AND source = ?",
        )
        .run(normalizedCnpj, source);
      const insert = this.db.prepare(
        `INSERT INTO portal_sancoes (cnpj, source, idx, raw_json, last_synced_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      rows.forEach((row, idx) => {
        insert.run(normalizedCnpj, source, idx, JSON.stringify(row), now);
      });
    });
    timed(`replaceSancoes(${source})`, list.length, () => tx(list));
  }

  replaceContratos(cnpj: string, list: unknown[]): void {
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    const now = new Date().toISOString();
    const tx = this.db.transaction((rows: unknown[]) => {
      this.db
        .prepare("DELETE FROM portal_contratos WHERE cnpj = ?")
        .run(normalizedCnpj);
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO portal_contratos (contrato_id, cnpj, raw_json, last_synced_at)
         VALUES (?, ?, ?, ?)`,
      );
      rows.forEach((row, idx) => {
        const contratoId = readContratoId(row) ?? `${normalizedCnpj}:${idx}`;
        insert.run(contratoId, normalizedCnpj, JSON.stringify(row), now);
      });
    });
    timed("replaceContratos", list.length, () => tx(list));
  }

  markSupplierPortalSync(cnpj: string): void {
    const now = new Date().toISOString();
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    this.db
      .prepare(
        `UPDATE pessoas_juridicas SET last_portal_synced_at = ? WHERE cnpj = ?`,
      )
      .run(now, normalizedCnpj);
  }

  listEmpenhosByCnpj(cnpj: string): PortalEmpenhoRow[] {
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    const rows = this.db
      .prepare(
        `SELECT documento, cnpj, ano, fase, raw_json, last_synced_at
         FROM portal_empenhos WHERE cnpj = ? ORDER BY ano DESC, documento`,
      )
      .all(normalizedCnpj) as {
      documento: string;
      cnpj: string;
      ano: number;
      fase: number;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      documento: row.documento,
      cnpj: row.cnpj,
      ano: row.ano,
      fase: row.fase,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  listEmpenhosByArp(numeroControlePncpAta: string): PortalEmpenhoRow[] {
    const rows = this.db
      .prepare(
        `SELECT pe.documento, pe.cnpj, pe.ano, pe.fase, pe.raw_json, pe.last_synced_at
         FROM portal_empenhos pe
         INNER JOIN arp_items ai ON ai.ni_fornecedor = pe.cnpj
         WHERE ai.numero_controle_pncp_ata = ?
         GROUP BY pe.documento
         ORDER BY pe.ano DESC, pe.documento`,
      )
      .all(numeroControlePncpAta) as {
      documento: string;
      cnpj: string;
      ano: number;
      fase: number;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      documento: row.documento,
      cnpj: row.cnpj,
      ano: row.ano,
      fase: row.fase,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  listContratosByCnpj(cnpj: string): PortalContratoRow[] {
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    const rows = this.db
      .prepare(
        `SELECT contrato_id, cnpj, raw_json, last_synced_at
         FROM portal_contratos WHERE cnpj = ? ORDER BY contrato_id`,
      )
      .all(normalizedCnpj) as {
      contrato_id: string;
      cnpj: string;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      contratoId: row.contrato_id,
      cnpj: row.cnpj,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  listContratosByArp(numeroControlePncpAta: string): PortalContratoRow[] {
    const rows = this.db
      .prepare(
        `SELECT pc.contrato_id, pc.cnpj, pc.raw_json, pc.last_synced_at
         FROM portal_contratos pc
         INNER JOIN arp_items ai ON ai.ni_fornecedor = pc.cnpj
         WHERE ai.numero_controle_pncp_ata = ?
         GROUP BY pc.contrato_id
         ORDER BY pc.contrato_id`,
      )
      .all(numeroControlePncpAta) as {
      contrato_id: string;
      cnpj: string;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      contratoId: row.contrato_id,
      cnpj: row.cnpj,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  listSancoesByCnpj(cnpj: string): PortalSancaoRow[] {
    const normalizedCnpj = normalizeDigits(cnpj) ?? cnpj;
    const rows = this.db
      .prepare(
        `SELECT cnpj, source, idx, raw_json, last_synced_at
         FROM portal_sancoes WHERE cnpj = ? ORDER BY source, idx`,
      )
      .all(normalizedCnpj) as {
      cnpj: string;
      source: "ceis" | "cnep";
      idx: number;
      raw_json: string;
      last_synced_at: string;
    }[];
    return rows.map((row) => ({
      cnpj: row.cnpj,
      source: row.source,
      idx: row.idx,
      raw: JSON.parse(row.raw_json) as unknown,
      lastSyncedAt: row.last_synced_at,
    }));
  }

  findEmpenhoCnpj(documento: string): string | null {
    const row = this.db
      .prepare("SELECT cnpj FROM portal_empenhos WHERE documento = ?")
      .get(documento) as { cnpj: string } | undefined;
    return row ? row.cnpj : null;
  }

  findEmpenhoBundle(documento: string): PortalEmpenhoBundle | null {
    const empRow = this.db
      .prepare(
        `SELECT raw_json FROM portal_empenhos WHERE documento = ?`,
      )
      .get(documento) as { raw_json: string } | undefined;
    if (!empRow) return null;

    const detailRow = this.db
      .prepare(
        `SELECT raw_json FROM portal_empenho_details WHERE documento = ?`,
      )
      .get(documento) as { raw_json: string } | undefined;

    const itensRows = this.db
      .prepare(
        `SELECT sequencial, raw_json FROM portal_empenho_itens
         WHERE documento = ? ORDER BY sequencial`,
      )
      .all(documento) as { sequencial: number; raw_json: string }[];

    const historicoRows = this.db
      .prepare(
        `SELECT sequencial, idx, raw_json FROM portal_empenho_historico
         WHERE documento = ? ORDER BY sequencial, idx`,
      )
      .all(documento) as {
      sequencial: number;
      idx: number;
      raw_json: string;
    }[];

    const relacionadosRows = this.db
      .prepare(
        `SELECT related_documento, fase, raw_json FROM portal_documentos_relacionados
         WHERE documento = ? ORDER BY fase, related_documento`,
      )
      .all(documento) as {
      related_documento: string;
      fase: number;
      raw_json: string;
    }[];

    return {
      documento,
      empenho: JSON.parse(empRow.raw_json) as unknown,
      detail: detailRow ? (JSON.parse(detailRow.raw_json) as unknown) : null,
      itens: itensRows.map((row) => ({
        sequencial: row.sequencial,
        raw: JSON.parse(row.raw_json) as unknown,
      })),
      historico: historicoRows.map((row) => ({
        sequencial: row.sequencial,
        idx: row.idx,
        raw: JSON.parse(row.raw_json) as unknown,
      })),
      relacionados: relacionadosRows.map((row) => ({
        related: row.related_documento,
        fase: row.fase,
        raw: JSON.parse(row.raw_json) as unknown,
      })),
    };
  }

  findDistinctCnpjsForArp(numeroControlePncpAta: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ni_fornecedor FROM arp_items
         WHERE numero_controle_pncp_ata = ? AND ni_fornecedor IS NOT NULL`,
      )
      .all(numeroControlePncpAta) as { ni_fornecedor: string }[];
    return rows.map((r) => r.ni_fornecedor);
  }

  findDistinctCnpjsForUasg(codigoUasg: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ai.ni_fornecedor
         FROM arp_items ai
         INNER JOIN arps a ON a.numero_controle_pncp_ata = ai.numero_controle_pncp_ata
         WHERE a.codigo_uasg = ? AND ai.ni_fornecedor IS NOT NULL`,
      )
      .all(codigoUasg) as { ni_fornecedor: string }[];
    return rows.map((r) => r.ni_fornecedor);
  }
}

function readSequencial(row: unknown, fallback: number): number {
  if (typeof row !== "object" || row === null) return fallback;
  const v = (row as { sequencial?: unknown }).sequencial;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Number.parseInt(v, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function readRelatedDocumento(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  for (const key of ["documento", "documentoRelacionado", "codigoDocumento"]) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function readContratoId(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  for (const key of ["id", "numero", "numeroContrato"]) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}
