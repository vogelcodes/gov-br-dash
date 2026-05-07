const decimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat("pt-BR");

export const fmtMoney = (v: number | null | undefined): string =>
  v == null ? "—" : `R$ ${decimal.format(v)}`;

export const fmtNum = (v: number | null | undefined): string =>
  v == null ? "—" : intFmt.format(v);

export const fmtDate = (d: string | null | undefined): string =>
  d ? d.substring(0, 10).split("-").reverse().join("/") : "—";

export const fmtCnpj = (s: string | null | undefined): string => {
  const digits = String(s ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return s ?? "—";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

export const pct = (a: number, b: number): number =>
  b > 0 ? Math.round((a / b) * 100) : 0;

export const cnpjDigits = (s: string | null | undefined): string =>
  String(s ?? "").replace(/\D/g, "");
