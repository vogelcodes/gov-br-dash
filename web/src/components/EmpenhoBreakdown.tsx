import type { EmpenhoRow } from "../lib/aggregates";
import { fmtNum, pct } from "../lib/format";

interface Props {
  rows: EmpenhoRow[];
  synced: boolean;
}

export function EmpenhoBreakdown({ rows, synced }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-xs text-slate-500 px-5 py-4">
        {synced
          ? "Nenhum empenho para este item."
          : "Empenhos ainda não sincronizados para este item."}
      </div>
    );
  }
  const maxReg = Math.max(1, ...rows.map((r) => r.registrada));

  return (
    <div className="bg-slate-50 rounded p-4 mt-2">
      <div className="grid grid-cols-[3fr_1.5fr_1fr_1fr_1fr] gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-200">
        <div>Unidade</div>
        <div>Execução</div>
        <div className="text-right">Registrada</div>
        <div className="text-right">Empenhada</div>
        <div className="text-right">Saldo</div>
      </div>
      {rows.map((r, i) => {
        const pp = pct(r.empenhada, r.registrada);
        const risk = pp < 50 && r.saldo > 0;
        const fullBar = (r.registrada / maxReg) * 100;
        const empBar = (r.empenhada / maxReg) * 100;
        const tipoColor =
          r.tipo === "PARTICIPANTE"
            ? "text-govbr-deepblue"
            : r.tipo === "CARONA"
              ? "text-purple-700"
              : "text-slate-600";
        return (
          <div
            key={i}
            className="grid grid-cols-[3fr_1.5fr_1fr_1fr_1fr] gap-3 items-center py-3 border-b border-slate-100 last:border-b-0"
          >
            <div>
              <div className="text-[13px] font-medium">{r.unidade}</div>
              <div
                className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${tipoColor}`}
              >
                {r.tipo}
              </div>
            </div>
            <div className="relative h-[18px] bg-slate-200 rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-slate-300"
                style={{ width: `${fullBar}%` }}
              />
              <div
                className={`absolute inset-y-0 left-0 ${risk ? "bg-govbr-danger" : "bg-govbr-blue"}`}
                style={{ width: `${empBar}%` }}
              />
              <div className="absolute right-1 inset-y-0 flex items-center text-[10px] font-semibold tabular-nums text-slate-900">
                {pp}%
              </div>
            </div>
            <div className="text-right text-[13px] tabular-nums">
              {fmtNum(r.registrada)}
            </div>
            <div className="text-right text-[13px] tabular-nums font-medium">
              {fmtNum(r.empenhada)}
            </div>
            <div
              className={`text-right text-[13px] tabular-nums ${r.saldo > 0 ? "text-govbr-danger font-semibold" : ""}`}
            >
              {fmtNum(r.saldo)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
