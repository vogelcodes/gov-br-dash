// Mirror of src/services/staleness.ts. Keep thresholds in sync.

export type StaleLevel = "fresh" | "yellow" | "red";
export type RecordType = "uasg" | "arp" | "item" | "empenho" | "supplier";

const YELLOW_DAYS: Record<RecordType, number> = {
  uasg: 15,
  arp: 7,
  item: 3,
  empenho: 1,
  supplier: 15,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Threshold is based on last_synced_at (verification time), not
// last_changed_at — manual refresh that finds unchanged data must still
// clear the badge.
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

export function pickWorst(...levels: StaleLevel[]): StaleLevel {
  if (levels.includes("red")) return "red";
  if (levels.includes("yellow")) return "yellow";
  return "fresh";
}

export function formatAge(
  lastChangedAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!lastChangedAt) return "nunca atualizado";
  const ms = now.getTime() - Date.parse(lastChangedAt);
  if (Number.isNaN(ms) || ms < 0) return "agora mesmo";
  const days = Math.floor(ms / MS_PER_DAY);
  if (days < 1) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours < 1) return "menos de 1 hora atrás";
    return `${hours} hora${hours > 1 ? "s" : ""} atrás`;
  }
  if (days === 1) return "1 dia atrás";
  return `${days} dias atrás`;
}
