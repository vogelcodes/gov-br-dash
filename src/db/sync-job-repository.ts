import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./connection.js";

export type SyncJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type SyncJobPhase =
  | "arps"
  | "items"
  | "empenhos"
  | "portal-supplier"
  | null;

export type SyncJobKind = "uasg" | "portal-supplier-uasg" | "portal-supplier-arp";

export interface SyncJob {
  id: string;
  userId: string;
  codigoUasg: string;
  kind: SyncJobKind;
  targetId: string | null;
  status: SyncJobStatus;
  phase: SyncJobPhase;
  totalArps: number;
  processedArps: number;
  failedArps: number;
  currentArp: string | null;
  currentArpItemPage: number | null;
  currentArpItemTotalPages: number | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SyncJobProgressPatch {
  phase?: SyncJobPhase;
  totalArps?: number;
  processedArps?: number;
  failedArps?: number;
  currentArp?: string | null;
  currentArpItemPage?: number | null;
  currentArpItemTotalPages?: number | null;
  lastError?: string | null;
}

interface Row {
  id: string;
  user_id: string;
  codigo_uasg: string;
  kind: SyncJobKind;
  target_id: string | null;
  status: SyncJobStatus;
  phase: SyncJobPhase;
  total_arps: number;
  processed_arps: number;
  failed_arps: number;
  current_arp: string | null;
  current_arp_item_page: number | null;
  current_arp_item_total_pages: number | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function rowToJob(row: Row): SyncJob {
  return {
    id: row.id,
    userId: row.user_id,
    codigoUasg: row.codigo_uasg,
    kind: row.kind ?? "uasg",
    targetId: row.target_id,
    status: row.status,
    phase: row.phase,
    totalArps: row.total_arps,
    processedArps: row.processed_arps,
    failedArps: row.failed_arps,
    currentArp: row.current_arp,
    currentArpItemPage: row.current_arp_item_page,
    currentArpItemTotalPages: row.current_arp_item_total_pages,
    lastError: row.last_error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export class SqliteSyncJobRepository {
  constructor(private readonly db: AppDatabase) {}

  enqueue(userId: string, codigoUasg: string): SyncJob {
    return this.enqueueWithKind(userId, codigoUasg, "uasg", null);
  }

  enqueuePortalSupplierUasg(userId: string, codigoUasg: string): SyncJob {
    return this.enqueueWithKind(
      userId,
      codigoUasg,
      "portal-supplier-uasg",
      codigoUasg,
    );
  }

  enqueuePortalSupplierArp(
    userId: string,
    codigoUasg: string,
    numeroControlePncpAta: string,
  ): SyncJob {
    return this.enqueueWithKind(
      userId,
      codigoUasg,
      "portal-supplier-arp",
      numeroControlePncpAta,
    );
  }

  private enqueueWithKind(
    userId: string,
    codigoUasg: string,
    kind: SyncJobKind,
    targetId: string | null,
  ): SyncJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sync_jobs
          (id, user_id, codigo_uasg, kind, target_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
      )
      .run(id, userId, codigoUasg, kind, targetId, now);
    const job = this.findById(id);
    if (!job) throw new Error("failed to enqueue sync job");
    return job;
  }

  findById(id: string): SyncJob | null {
    const row = this.db
      .prepare("SELECT * FROM sync_jobs WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? rowToJob(row) : null;
  }

  findActiveForUasg(userId: string, codigoUasg: string): SyncJob | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sync_jobs
         WHERE user_id = ? AND codigo_uasg = ?
           AND status IN ('queued','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId, codigoUasg) as Row | undefined;
    return row ? rowToJob(row) : null;
  }

  findLatestForUasg(userId: string, codigoUasg: string): SyncJob | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sync_jobs
         WHERE user_id = ? AND codigo_uasg = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId, codigoUasg) as Row | undefined;
    return row ? rowToJob(row) : null;
  }

  /**
   * Atomically claim the oldest queued job. Wraps the SELECT+UPDATE in
   * BEGIN IMMEDIATE so a second worker (or a concurrent enqueue) cannot
   * grab the same row.
   */
  claimNext(): SyncJob | null {
    const tx = this.db.transaction((): SyncJob | null => {
      const row = this.db
        .prepare(
          `SELECT * FROM sync_jobs
           WHERE status = 'queued'
           ORDER BY created_at ASC LIMIT 1`,
        )
        .get() as Row | undefined;
      if (!row) return null;
      const startedAt = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE sync_jobs SET status = 'running', started_at = ?
           WHERE id = ? AND status = 'queued'`,
        )
        .run(startedAt, row.id);
      return rowToJob({ ...row, status: "running", started_at: startedAt });
    });
    return tx.immediate();
  }

  updateProgress(id: string, patch: SyncJobProgressPatch): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const map: Record<keyof SyncJobProgressPatch, string> = {
      phase: "phase",
      totalArps: "total_arps",
      processedArps: "processed_arps",
      failedArps: "failed_arps",
      currentArp: "current_arp",
      currentArpItemPage: "current_arp_item_page",
      currentArpItemTotalPages: "current_arp_item_total_pages",
      lastError: "last_error",
    };
    for (const [key, col] of Object.entries(map) as [
      keyof SyncJobProgressPatch,
      string,
    ][]) {
      if (key in patch) {
        fields.push(`${col} = ?`);
        values.push(patch[key] ?? null);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db
      .prepare(`UPDATE sync_jobs SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  }

  complete(id: string, status: "done" | "failed" | "cancelled", error?: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sync_jobs SET status = ?, finished_at = ?, last_error = COALESCE(?, last_error)
         WHERE id = ? AND status != 'cancelled'`,
      )
      .run(status, now, error ?? null, id);
  }

  cancel(id: string, userId: string): boolean {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `UPDATE sync_jobs SET status = 'cancelled', finished_at = ?
         WHERE id = ? AND user_id = ? AND status IN ('queued', 'running')`,
      )
      .run(now, id, userId);
    return res.changes > 0;
  }

  countSinceMonthStart(userId: string, now = new Date()): number {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    // Only UASG syncs count toward the user's monthly quota — portal-supplier
    // jobs are gated by the Portal API's own per-minute quota instead.
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM sync_jobs
         WHERE user_id = ? AND created_at >= ? AND kind = 'uasg' AND status != 'cancelled'`,
      )
      .get(userId, monthStart) as { count: number };
    return row.count;
  }

  findActiveForArp(
    userId: string,
    numeroControlePncpAta: string,
  ): SyncJob | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sync_jobs
         WHERE user_id = ? AND target_id = ?
           AND kind = 'portal-supplier-arp'
           AND status IN ('queued','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId, numeroControlePncpAta) as Row | undefined;
    return row ? rowToJob(row) : null;
  }

  findLatestForArp(
    userId: string,
    numeroControlePncpAta: string,
  ): SyncJob | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sync_jobs
         WHERE user_id = ? AND target_id = ?
           AND kind = 'portal-supplier-arp'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId, numeroControlePncpAta) as Row | undefined;
    return row ? rowToJob(row) : null;
  }

  /**
   * On boot, mark any 'running' jobs as failed — they were owned by a
   * previous process that is no longer running. Returns the affected count.
   */
  failOrphanedRunning(reason = "process restarted"): number {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `UPDATE sync_jobs
         SET status = 'failed', finished_at = ?, last_error = ?
         WHERE status = 'running'`,
      )
      .run(now, reason);
    return res.changes;
  }
}
