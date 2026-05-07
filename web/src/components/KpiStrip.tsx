import type { ArpSummary } from "../api/types";
import { fmtMoney, fmtNum, pct } from "../lib/format";

interface Props {
  summaries: ArpSummary[];
}

export function KpiStrip({ summaries }: Props) {
  const totalArps = summaries.length;
  const valorTotal = summaries.reduce((s, r) => s + (r.arp.valorTotal ?? 0), 0);
  const itemsLoaded = summaries.reduce(
    (s, r) =>
      s +
      (r.expectedItems != null && r.expectedItems > 0
        ? Math.min(r.itemCount, r.expectedItems)
        : r.itemCount),
    0,
  );
  const itemsExpected = summaries.reduce(
    (s, r) => s + (r.expectedItems ?? r.itemCount),
    0,
  );
  const arpsWithoutItems = summaries.filter((r) => r.itemCount === 0).length;
  const arpsWithoutEmpenhos = summaries.filter(
    (r) => r.empenhoCount === 0 && r.itemCount > 0,
  ).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        accent="border-govbr-blue"
        label="ARPs ativas"
        value={fmtNum(totalArps)}
        sub={`${fmtNum(itemsLoaded)} de ${fmtNum(itemsExpected)} itens carregados`}
      />
      <Card
        accent="border-govbr-navy"
        label="Valor total das ARPs"
        value={fmtMoney(valorTotal)}
        sub="Somatório das atas listadas"
      />
      <Card
        accent="border-govbr-deepblue"
        label="Cobertura de itens"
        value={`${pct(itemsLoaded, itemsExpected)}%`}
        sub={
          arpsWithoutItems > 0
            ? `${arpsWithoutItems} ARP(s) sem itens`
            : "Todos os itens carregados"
        }
      />
      <Card
        accent="border-govbr-danger"
        label="Empenhos pendentes"
        value={fmtNum(arpsWithoutEmpenhos)}
        sub="ARPs com itens mas sem empenhos"
      />
    </div>
  );
}

function Card({
  accent,
  label,
  value,
  sub,
}: {
  accent: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-md p-4 border-l-4 ${accent}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
        {value}
      </div>
      <div className="text-xs text-slate-600 mt-1">{sub}</div>
    </div>
  );
}
