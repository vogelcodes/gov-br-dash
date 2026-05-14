import { Link } from "@tanstack/react-router";
import type { ArpSummary } from "../api/types";
import { fmtMoney, fmtNum } from "../lib/format";
import { useRefreshArp } from "../api/queries";
import { RefreshButton } from "./RefreshButton";
import { pickWorst, staleness } from "../lib/staleness";
import { StaleBadge, staleTintClass } from "./StaleBadge";

interface Props {
  codigoUasg: string;
  summaries: ArpSummary[];
  selectedAta: string | undefined;
  jobActive?: boolean;
}

export function ArpSidebar({
  codigoUasg,
  summaries,
  selectedAta,
  jobActive,
}: Props) {
  const summariesReverse = summaries.slice().reverse();
  summaries = summariesReverse;

  return (
    <aside className="w-[360px] flex-shrink-0 bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          Atas de Registro de Preços
        </div>
        <div className="text-sm text-slate-900 mt-1">
          {summaries.length} exibidas
        </div>
      </div>
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
        {summaries.length === 0 && (
          <div className="p-6 text-sm text-slate-500 text-center">
            Nenhuma ARP carregada ainda.
          </div>
        )}
        {summaries.map((s) => (
          <SidebarRow
            key={s.arp.numeroControlePncpAta}
            codigoUasg={codigoUasg}
            summary={s}
            active={s.arp.numeroControlePncpAta === selectedAta}
            jobActive={jobActive}
          />
        ))}
      </div>
    </aside>
  );
}

function SidebarRow({
  codigoUasg,
  summary,
  active,
  jobActive,
}: {
  codigoUasg: string;
  summary: ArpSummary;
  active: boolean;
  jobActive?: boolean;
}) {
  const {
    arp,
    itemCount,
    expectedItems,
    lastSyncedAt,
    lastItemsSyncedAt,
    lastEmpenhosSyncedAt,
  } = summary;
  const refresh = useRefreshArp(codigoUasg, arp.numeroControlePncpAta);

  const staleLevel = pickWorst(
    staleness(lastSyncedAt, "arp"),
    staleness(lastItemsSyncedAt, "item"),
    staleness(lastEmpenhosSyncedAt, "empenho"),
  );
  const staleTooltipDate =
    lastEmpenhosSyncedAt ?? lastItemsSyncedAt ?? lastSyncedAt;

  const itemsExpected = expectedItems ?? 0;
  const itemsComplete =
    itemsExpected > 0 ? itemCount >= itemsExpected : itemCount > 0;
  const empenhosSynced = lastEmpenhosSyncedAt !== null;
  const fullySynced = itemsComplete && empenhosSynced;
  const blurred = jobActive && !fullySynced;

  let status: { text: string; color: string };
  if (!itemsComplete) {
    status = {
      text:
        itemCount === 0
          ? "Itens não carregados"
          : `${itemCount} de ${itemsExpected} itens`,
      color: "text-govbr-danger",
    };
  } else if (!empenhosSynced) {
    status = { text: "Empenhos pendentes", color: "text-amber-600" };
  } else {
    status = { text: "Sincronizado", color: "text-emerald-700" };
  }

  const linkClasses = `block px-4 py-3 border-b border-slate-100 cursor-pointer border-l-[3px] hover:bg-slate-50 ${
    active
      ? "bg-govbr-lightblue border-l-govbr-blue"
      : `border-l-transparent ${staleTintClass(staleLevel)}`
  } `;

  return (
    <Link
      to="/uasg/$codigoUasg/arp/$ata"
      params={{ codigoUasg, ata: arp.numeroControlePncpAta }}
      className={linkClasses}
      aria-disabled={blurred || undefined}
      resetScroll={false}
    >
      <div className="flex justify-between items-baseline mb-1">
        <div
          className={`text-sm font-semibold tabular-nums ${
            active ? "text-govbr-deepblue" : "text-slate-900"
          }`}
        >
          ARP {arp.numeroAtaRegistroPreco}
        </div>
        <div className="flex items-center gap-1.5">
          {!jobActive && (
            <RefreshButton
              onClick={() => refresh.mutate()}
              isPending={refresh.isPending}
              title={
                staleLevel === "fresh"
                  ? "Dados atualizados"
                  : "Atualizar esta ARP"
              }
              disabled={staleLevel === "fresh"}
            />
          )}
          <StaleBadge level={staleLevel} lastChangedAt={staleTooltipDate} />
        </div>
      </div>
      <div className="text-xs text-slate-700 mb-2 line-clamp-2">
        {arp.objeto || "—"}
      </div>
      <div className="flex justify-between text-[11px] text-slate-700 tabular-nums">
        <span>{fmtMoney(arp.valorTotal)}</span>
        <span>{fmtNum(arp.quantidadeItens)} itens</span>
      </div>
      {status.text !== "Sincronizado" ? (
        <div className={`text-[10px] mt-1 ${status.color}`}>{status.text}</div>
      ) : (
        ""
      )}
    </Link>
  );
}
