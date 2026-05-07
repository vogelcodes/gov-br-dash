import type { ArpItem, Empenho, PessoaJuridica } from "../api/types";
import { aggregateItem } from "../lib/aggregates";
import { cnpjDigits, fmtCnpj, fmtMoney, fmtNum } from "../lib/format";
import { useRefreshItem } from "../api/queries";
import { RefreshButton } from "./RefreshButton";
import { EmpenhoBreakdown } from "./EmpenhoBreakdown";

interface Props {
  codigoUasg: string;
  ata: string;
  item: ArpItem;
  empenhos: Empenho[] | undefined;
  suppliers: Record<string, PessoaJuridica> | undefined;
  expanded: boolean;
  lastSync: string | undefined;
  onToggle: () => void;
  jobActive?: boolean;
}

export function ItemCard({
  codigoUasg,
  ata,
  item,
  empenhos,
  suppliers,
  expanded,
  lastSync,
  onToggle,
  jobActive,
}: Props) {
  const refresh = useRefreshItem(codigoUasg, ata, item.numeroItem);
  const ag = aggregateItem(item, empenhos);
  const riskExec = ag.execPct < 50;
  const cnpj = cnpjDigits(item.niFornecedor);
  const supplier =
    item.nomeRazaoSocialFornecedor ||
    (cnpj && suppliers?.[cnpj]?.nome) ||
    (cnpj && suppliers?.[cnpj]?.razaoSocial) ||
    "—";

  return (
    <div
      data-item-id={item.numeroItem}
      className="bg-white border border-slate-200 rounded overflow-hidden"
    >
      <div
        onClick={onToggle}
        className="px-5 py-4 cursor-pointer grid grid-cols-[60px_1fr_160px_140px_64px] gap-4 items-center hover:bg-slate-50"
      >
        <div className="text-xs font-bold text-govbr-blue tabular-nums">
          #{item.numeroItem}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-tight">
            {item.descricaoItem || "—"}
          </div>
          <div className="text-[11px] text-slate-700 mt-1">
            <strong>{supplier}</strong>
            {cnpj && ` · CNPJ ${fmtCnpj(cnpj)}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Valor empenhado
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {fmtMoney(ag.valorEmp)}
          </div>
          <div className="text-[11px] text-slate-700 tabular-nums">
            de {fmtMoney(item.valorTotal)}
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <div
              className={`text-2xl font-semibold tabular-nums ${
                riskExec ? "text-govbr-danger" : "text-govbr-blue"
              }`}
            >
              {ag.execPct}%
            </div>
            <div className="text-[11px] text-slate-700">executado</div>
          </div>
          <div className="h-1.5 bg-slate-200 rounded mt-1.5 overflow-hidden">
            <div
              className={
                riskExec ? "h-full bg-govbr-danger" : "h-full bg-govbr-blue"
              }
              style={{ width: `${ag.execPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 mt-1 tabular-nums">
            {fmtNum(ag.totalEmp)}/{fmtNum(ag.totalReg)} unid.
          </div>
        </div>
        <div className="flex items-center gap-1 justify-self-end">
          {!jobActive && (
            <RefreshButton
              onClick={() => refresh.mutate()}
              isPending={refresh.isPending}
              title="Atualizar este item"
            />
          )}
          <span className="text-govbr-blue text-sm">
            {expanded ? "▴" : "▾"}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-200">
          <EmpenhoBreakdown rows={ag.rows} synced={lastSync ? true : false} />
        </div>
      )}
    </div>
  );
}
