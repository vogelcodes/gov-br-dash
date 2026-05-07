import { fmtDate } from "../lib/format";

interface Props {
  inicial?: string;
  final?: string;
}

export function VigenciaTimeline({ inicial, final }: Props) {
  const ini = inicial ? new Date(inicial).getTime() : null;
  const fim = final ? new Date(final).getTime() : null;
  const today = Date.now();
  const total = ini && fim ? fim - ini : 0;
  const elapsed = total > 0 ? Math.max(0, Math.min(total, today - (ini ?? 0))) : 0;
  const pctNow = total > 0 ? (elapsed / total) * 100 : 0;
  const future = ini != null && today < ini;
  const past = fim != null && today > fim;
  const todayStr = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="bg-slate-50 rounded p-4">
      <div className="flex justify-between items-baseline mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          Vigência da ata
        </div>
        <div className="text-xs text-slate-700 tabular-nums">
          {fmtDate(inicial)} → {fmtDate(final)}
        </div>
      </div>
      <div className="relative h-2 bg-slate-200 rounded">
        <div
          className="h-full bg-govbr-blue rounded"
          style={{ width: `${pctNow}%` }}
        />
        {!future && !past && total > 0 && (
          <div
            className="absolute -top-1 w-0.5 h-5 bg-govbr-danger"
            style={{ left: `calc(${pctNow}% - 1px)` }}
          />
        )}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-slate-500 tabular-nums">
        <span>início</span>
        {!future && !past && (
          <span className="text-govbr-danger font-semibold">
            hoje · {todayStr}
          </span>
        )}
        <span>término</span>
      </div>
    </div>
  );
}
