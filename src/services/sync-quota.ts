import type { SqliteSyncJobRepository } from "../db/sync-job-repository.js";

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly resetsAt: string,
  ) {
    super(message);
  }
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export class SyncQuotaService {
  constructor(
    private readonly jobs: SqliteSyncJobRepository,
    private readonly limit: number,
  ) {}

  getStatus(userId: string, now = new Date()): QuotaInfo {
    const used = this.jobs.countSinceMonthStart(userId, now);
    return {
      used,
      limit: this.limit,
      remaining: Math.max(0, this.limit - used),
      resetsAt: nextMonthStart(now),
    };
  }

  assertCanEnqueue(userId: string, now = new Date()): void {
    const status = this.getStatus(userId, now);
    if (status.remaining <= 0) {
      throw new QuotaExceededError(
        `Monthly sync quota reached (${status.used}/${status.limit}). Resets ${status.resetsAt}.`,
        status.resetsAt,
      );
    }
  }
}

function nextMonthStart(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
}
