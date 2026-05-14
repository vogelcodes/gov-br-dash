import type {
  SqliteSyncJobRepository,
  SyncJob,
  SyncJobPhase,
  SyncJobProgressPatch,
} from "../db/sync-job-repository.js";
import type {
  SyncProgress,
  SyncProgressSink,
  UserDataSyncService,
} from "./user-data-sync.js";
import type {
  PortalDataSyncService,
  PortalSyncProgressSink,
} from "./portal-data-sync.js";

interface RunnerLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface SyncJobRunnerOptions {
  pollIntervalMs?: number;
  /** How often (ms) to flush a buffered progress patch to the DB. */
  flushIntervalMs?: number;
  /**
   * When true, finishing a `kind="uasg"` job successfully enqueues a
   * follow-up `portal-supplier-uasg` job for the same user/UASG. Defaults
   * to true so portal data stays in sync without an extra UI step.
   */
  autoChainPortalSync?: boolean;
}

/**
 * In-process worker. Polls sync_jobs for queued work and dispatches by
 * `kind` to either UserDataSyncService (UASG sync) or PortalDataSyncService
 * (portal-supplier sync). Single concurrent job: each upstream API has its
 * own rate limit and parallelism only amplifies 429s.
 */
export class SyncJobRunner {
  private aborted = false;
  private loopPromise: Promise<void> | null = null;
  private wakeUp: (() => void) | null = null;
  private readonly pollIntervalMs: number;
  private readonly flushIntervalMs: number;
  private readonly autoChainPortalSync: boolean;

  constructor(
    private readonly jobs: SqliteSyncJobRepository,
    private readonly syncService: UserDataSyncService,
    private readonly portalSyncService: PortalDataSyncService,
    private readonly logger: RunnerLogger,
    options: SyncJobRunnerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.flushIntervalMs = options.flushIntervalMs ?? 500;
    this.autoChainPortalSync = options.autoChainPortalSync ?? true;
  }

  start(): void {
    if (this.loopPromise) return;
    const orphans = this.jobs.requeueOrphanedRunning();
    if (orphans > 0) {
      this.logger.warn(
        { count: orphans },
        "Re-queued interrupted sync jobs after process restart",
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
      {
        jobId: job.id,
        kind: job.kind,
        codigoUasg: job.codigoUasg,
        targetId: job.targetId,
        userId: job.userId,
      },
      "sync job started",
    );

    if (job.kind === "uasg") {
      await this.runUasgJob(job);
      return;
    }
    if (
      job.kind === "portal-supplier-uasg" ||
      job.kind === "portal-supplier-arp"
    ) {
      await this.runPortalJob(job);
      return;
    }
    if (job.kind === "bg-refresh-arp" || job.kind === "bg-refresh-supplier") {
      await this.runBgRefreshJob(job);
      return;
    }
    this.jobs.complete(job.id, "failed", `unknown job kind: ${job.kind}`);
  }

  private async runBgRefreshJob(job: SyncJob): Promise<void> {
    if (!job.targetId) {
      this.jobs.complete(job.id, "failed", `${job.kind} missing target_id`);
      return;
    }
    try {
      if (job.kind === "bg-refresh-arp") {
        await this.syncService.refreshArp(job.targetId);
      } else {
        await this.syncService.refreshPessoaJuridica(job.targetId);
      }
      this.jobs.complete(job.id, "done");
      this.logger.info(
        { jobId: job.id, kind: job.kind, target: job.targetId },
        "bg refresh done",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.jobs.complete(job.id, "failed", msg);
      this.logger.warn(
        { jobId: job.id, kind: job.kind, err: msg },
        "bg refresh failed",
      );
    }
  }

  private async runUasgJob(job: SyncJob): Promise<void> {
    const sink = this.makeUasgSink(job.id);
    try {
      await this.syncService.syncUasg(job.codigoUasg, sink);
      sink.flushNow();
      this.jobs.complete(job.id, "done");
      const completedJob = this.jobs.findById(job.id);
      if (completedJob?.status === "cancelled") {
        this.logger.info({ jobId: job.id }, "sync job cancelled by user");
        return;
      }
      this.logger.info({ jobId: job.id }, "sync job done");
      if (this.autoChainPortalSync) {
        try {
          const chained = this.jobs.enqueuePortalSupplierUasg(
            job.userId,
            job.codigoUasg,
          );
          this.logger.info(
            { parentJobId: job.id, chainedJobId: chained.id },
            "auto-chained portal-supplier sync after UASG sync",
          );
          this.wakeUp?.();
        } catch (err) {
          this.logger.warn(
            { jobId: job.id, err },
            "failed to auto-chain portal-supplier sync",
          );
        }
      }
    } catch (err) {
      sink.flushNow();
      const msg = err instanceof Error ? err.message : String(err);
      this.jobs.complete(job.id, "failed", msg);
      this.logger.error({ jobId: job.id, err: msg }, "sync job failed");
    }
  }

  private async runPortalJob(job: SyncJob): Promise<void> {
    const sink = this.makePortalSink(job.id);
    try {
      sink.setJobPhase("portal-supplier");
      if (job.kind === "portal-supplier-arp") {
        if (!job.targetId) {
          throw new Error("portal-supplier-arp job missing target_id");
        }
        await this.portalSyncService.syncArpSuppliers(job.targetId, {
          progress: sink,
          includeDetails: false,
        });
      } else {
        await this.portalSyncService.syncUasgSuppliers(job.codigoUasg, {
          progress: sink,
          includeDetails: false,
        });
      }
      sink.flushNow();
      this.jobs.complete(job.id, "done");
      this.logger.info({ jobId: job.id }, "portal sync job done");
    } catch (err) {
      sink.flushNow();
      const msg = err instanceof Error ? err.message : String(err);
      this.jobs.complete(job.id, "failed", msg);
      this.logger.error({ jobId: job.id, err: msg }, "portal sync job failed");
    }
  }

  private makeUasgSink(jobId: string): SyncProgressSink & { flushNow(): void } {
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
        flush(true);
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
        flush(true);
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
        void totalArps;
        flush(true);
      },
    };
  }

  private makePortalSink(
    jobId: string,
  ): PortalSyncProgressSink & {
    flushNow(): void;
    setJobPhase(phase: SyncJobPhase): void;
  } {
    let buffer: SyncJobProgressPatch = {};
    let processed = 0;
    let failed = 0;
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
        this.logger.warn({ jobId, err }, "failed to flush portal job progress");
      }
    };

    const merge = (patch: SyncJobProgressPatch): void => {
      Object.assign(buffer, patch);
    };

    // Reuse total/processed/failed counters from the UASG schema — the UI
    // already polls these for any sync_jobs row.
    return {
      setJobPhase: (phase) => {
        merge({ phase });
        flush(true);
      },
      setTotalSuppliers: (n) => {
        merge({ totalArps: n });
        flush(true);
      },
      startSupplier: (cnpj) => {
        merge({ currentArp: cnpj });
        flush(true);
      },
      supplierDone: () => {
        processed += 1;
        merge({ processedArps: processed });
        flush(true);
      },
      supplierFailed: (err) => {
        failed += 1;
        merge({
          failedArps: failed,
          lastError: err instanceof Error ? err.message : String(err),
        });
        flush(true);
      },
      flushNow: () => flush(true),
    };
  }
}
