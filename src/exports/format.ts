// BR-style currency / date formatting helpers, ported from
// LEgacy/portal-transparencia/src/exports/parse.py.

export function formatCurrencyBrl(value: unknown): string {
  const numeric = coerceNumber(value);
  if (numeric == null) return value == null ? "" : String(value);
  return `R$ ${numeric
    .toFixed(2)
    .replace(".", "X")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    .replace("X", ",")}`;
}

export function formatDateBr(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    // Already dd/mm/yyyy
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (brMatch) return value;
    const isoDate = new Date(value);
    if (!Number.isNaN(isoDate.getTime())) return toBrDate(isoDate);
    return value;
  }
  if (value instanceof Date) {
    return toBrDate(value);
  }
  return String(value);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function toBrDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
