export type StaleLevel = "fresh" | "yellow" | "red";
export type RecordType = "uasg" | "arp" | "item" | "empenho" | "supplier";

/**
 * Days since last_changed_at after which a record is considered stale.
 * Yellow = at threshold (auto-enqueue background refresh, low priority).
 * Red = 2x threshold (auto-enqueue background refresh, high priority).
 */
const YELLOW_DAYS: Record<RecordType, number> = {
  uasg: 15,
  arp: 7,
  item: 3,
  empenho: 1,
  supplier: 15,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Threshold is based on `last_synced_at` (when we last verified the data),
 * NOT `last_changed_at` (when content actually changed). A manual refresh
 * that finds upstream data unchanged must still clear the stale badge —
 * otherwise the badge would stick forever on data that legitimately never
 * changes.
 */
export function staleness(
  lastSyncedAt: string | null | undefined,
  type: RecordType,
  now: Date = new Date(),
): StaleLevel {
  if (!lastSyncedAt) return "red";
  const ageMs = now.getTime() - Date.parse(lastSyncedAt);
  if (Number.isNaN(ageMs) || ageMs < 0) return "fresh";
  const yellowMs = YELLOW_DAYS[type] * MS_PER_DAY;
  if (ageMs >= yellowMs * 2) return "red";
  if (ageMs >= yellowMs) return "yellow";
  return "fresh";
}

export function ageDays(timestamp: string | null | undefined, now: Date = new Date()): number | null {
  if (!timestamp) return null;
  const ms = now.getTime() - Date.parse(timestamp);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / MS_PER_DAY);
}
