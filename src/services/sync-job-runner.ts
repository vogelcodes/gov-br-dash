import type {
  SqliteSyncJobRepository,
  SyncJob,
  SyncJobProgressPatch,
} from "../db/sync-job-repository.js";
import type {
  SyncProgress,
  SyncProgressSink,
  UserDataSyncService,
} from "./user-data-sync.js";

interface RunnerLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface SyncJobRunnerOptions {
  pollIntervalMs?: number;
  /** How often (ms) to flush a buffered progress patch to the DB. */
  flushIntervalMs?: number;
}

/**
 * In-process worker. Polls sync_jobs for queued work and runs them through
 * UserDataSyncService. Single concurrent job: compras.gov rate limit is
 * global per IP, so parallelism only amplifies 429s.
 */
export class SyncJobRunner {
  private aborted = false;
  private loopPromise: Promise<void> | null = null;
  private wakeUp: (() => void) | null = null;
  private readonly pollIntervalMs: number;
  private readonly flushIntervalMs: number;

  constructor(
    private readonly jobs: SqliteSyncJobRepository,
    private readonly syncService: UserDataSyncService,
    private readonly logger: RunnerLogger,
    options: SyncJobRunnerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.flushIntervalMs = options.flushIntervalMs ?? 500;
  }

  start(): void {
    if (this.loopPromise) return;
    const orphans = this.jobs.failOrphanedRunning();
    if (orphans > 0) {
      this.logger.warn(
        { count: orphans },
        "Marked stale running sync jobs as failed (process restarted)",
      );
    }
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.aborted = true;
    this.wakeUp?.();
    await this.loopPromise;
  }

  private async loop(): Promise<void> {
    while (!this.aborted) {
      let job: SyncJob | null = null;
      try {
        job = this.jobs.claimNext();
      } catch (err) {
        this.logger.error({ err }, "claimNext failed");
      }
      if (!job) {
        await this.interruptibleSleep(this.pollIntervalMs);
        continue;
      }
      await this.runJob(job);
    }
  }

  private interruptibleSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.wakeUp = null;
        resolve();
      }, ms);
      this.wakeUp = () => {
        clearTimeout(t);
        this.wakeUp = null;
        resolve();
      };
    });
  }

  private async runJob(job: SyncJob): Promise<void> {
    this.logger.info(
      { jobId: job.id, codigoUasg: job.codigoUasg, userId: job.userId },
      "sync job started",
    );
    const sink = this.makeSink(job.id);
    try {
      await this.syncService.syncUasg(job.codigoUasg, sink);
      sink.flushNow();
      this.jobs.complete(job.id, "done");
      this.logger.info({ jobId: job.id }, "sync job done");
    } catch (err) {
      sink.flushNow();
      const msg = err instanceof Error ? err.message : String(err);
      this.jobs.complete(job.id, "failed", msg);
      this.logger.error({ jobId: job.id, err: msg }, "sync job failed");
    }
  }

  private makeSink(jobId: string): SyncProgressSink & { flushNow(): void } {
    let buffer: SyncJobProgressPatch = {};
    let processed = 0;
    let failed = 0;
    let totalArps = 0;
    let lastFlush = 0;

    const flush = (force = false): void => {
      if (Object.keys(buffer).length === 0) return;
      const now = Date.now();
      if (!force && now - lastFlush < this.flushIntervalMs) return;
      try {
        this.jobs.updateProgress(jobId, buffer);
        buffer = {};
        lastFlush = now;
      } catch (err) {
        this.logger.warn({ jobId, err }, "failed to flush job progress");
      }
    };

    const merge = (patch: SyncJobProgressPatch): void => {
      Object.assign(buffer, patch);
    };

    return {
      setPhase: (phase: SyncProgress["phase"]) => {
        merge({ phase });
        flush(true); // phase transitions are user-visible — flush eagerly
      },
      setTotalArps: (n: number) => {
        totalArps = n;
        merge({ totalArps: n });
        flush(true);
      },
      startArp: (numero: string) => {
        merge({
          currentArp: numero,
          currentArpItemPage: null,
          currentArpItemTotalPages: null,
        });
        flush();
      },
      setItemsPage: (page, totalPages) => {
        merge({
          currentArpItemPage: page,
          currentArpItemTotalPages: totalPages,
        });
        flush();
      },
      arpDone: () => {
        processed += 1;
        merge({ processedArps: processed });
        flush();
      },
      arpFailed: (err: unknown) => {
        failed += 1;
        merge({
          failedArps: failed,
          lastError: err instanceof Error ? err.message : String(err),
        });
        flush(true);
      },
      flushNow: () => {
        // unused vars suppression — totalArps captured for symmetry/debug
        void totalArps;
        flush(true);
      },
    };
  }
}

