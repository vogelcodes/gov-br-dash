// Portal da Transparência publishes per-minute caps that change at SP-local
// 00:00 and 06:00, so we re-read the active cap on every send and gate via a
// rolling 60s timestamp window. The cap flips live when the SP hour boundary
// is crossed mid-process (no host-TZ dependency).

const SP_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hour12: false,
});

export interface PortalRateLimiterOptions {
  dayPerMin: number;
  nightPerMin: number;
  windowMs?: number;
}

export class PortalRateLimiter {
  private readonly dayPerMin: number;
  private readonly nightPerMin: number;
  private readonly windowMs: number;
  private readonly stamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(options: PortalRateLimiterOptions) {
    this.dayPerMin = options.dayPerMin;
    this.nightPerMin = options.nightPerMin;
    this.windowMs = options.windowMs ?? 60_000;
  }

  async acquire(): Promise<void> {
    // Serialize acquisition so concurrent callers see a consistent stamp list
    // and don't race past the cap together.
    const next = this.chain.then(() => this.gate());
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async gate(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const cutoff = now - this.windowMs;
      while (this.stamps.length > 0 && this.stamps[0]! <= cutoff) {
        this.stamps.shift();
      }
      const cap = this.activeCap();
      if (this.stamps.length < cap) {
        this.stamps.push(now);
        return;
      }
      const oldest = this.stamps[0]!;
      const waitMs = oldest + this.windowMs - now + 5;
      await sleep(waitMs);
    }
  }

  private activeCap(): number {
    const hour = currentSpHour();
    return hour < 6 ? this.nightPerMin : this.dayPerMin;
  }
}

function currentSpHour(): number {
  const formatted = SP_HOUR_FORMATTER.format(new Date());
  // Intl returns "24" instead of "0" with hour12:false on some runtimes.
  const value = Number.parseInt(formatted, 10);
  if (Number.isNaN(value)) return 0;
  return value === 24 ? 0 : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}
