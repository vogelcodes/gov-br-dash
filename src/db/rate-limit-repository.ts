import type { AppDatabase } from "./connection.js";

/**
 * Persists the adaptive compras.gov request interval across restarts.
 * Single-row table — `id = 1` enforced via CHECK constraint in schema.
 */
export class SqliteRateLimitRepository {
  constructor(private readonly db: AppDatabase) {}

  getMinIntervalMs(): number {
    const row = this.db
      .prepare("SELECT min_interval_ms FROM rate_limit_state WHERE id = 1")
      .get() as { min_interval_ms: number } | undefined;
    return row?.min_interval_ms ?? 1100;
  }

  setMinIntervalMs(ms: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE rate_limit_state SET min_interval_ms = ?, updated_at = ? WHERE id = 1",
      )
      .run(Math.round(ms), now);
  }
}
