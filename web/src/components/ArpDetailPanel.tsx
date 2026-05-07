import { useState } from "react";
import type { Arp } from "../api/types";
import { useArpEmpenhos, useArpItems, useRefreshArp } from "../api/queries";
import { aggregateAta } from "../lib/aggregates";
import { fmtMoney, fmtNum, pct } from "../lib/format";
import { ItemCard } from "./ItemCard";
import { VigenciaTimeline } from "./VigenciaTimeline";
import { RefreshButton } from "./RefreshButton";

interface Props {
  codigoUasg: string;
  arp: Arp;
  jobActive?: boolean;
}

export function ArpDetailPanel({ codigoUasg, arp, jobActive }: Props) {
  const ata = arp.numeroControlePncpAta;
  const lastSync = arp.dataHoraAtualizacao;
  const itemsQ = useArpItems(ata);
  const empQ = useArpEmpenhos(ata);
  const refresh = useRefreshArp(codigoUasg, ata);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const items = itemsQ.data?.items ?? [];
  const empenhosByItem = empQ.data?.empenhosByItem;
  const suppliers = empQ.data?.pessoasJuridicasByCnpj;
  const ag = aggregateAta(items, empenhosByItem);

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllItems = () => {
    const allIds = items.map((it) => it.numeroItem);
    if (expandedItems.size === allIds.length) {
      setExpandedItems(new Set());
    } else {
      setExpandedItems(new Set(allIds));
    }
  };

  const isLoading = itemsQ.isLoading || empQ.isLoading;

  return (
    <section className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="panel">
        <div className="flex items-baseline gap-3 flex-wrap mb-2">
          <h2 className="text-2xl font-medium tabular-nums">
            ARP {arp.numeroAtaRegistroPreco}
          </h2>
          {arp.nomeModalidadeCompra && (
            <span className="pill bg-govbr-lightblue text-govbr-deepblue">
              {arp.nomeModalidadeCompra}
            </span>
          )}
          {arp.nomeOrgao && (
            <span className="pill bg-govbr-navy text-white">
              {arp.nomeOrgao}
            </span>
          )}
          {!jobActive && (
            <div className="ml-auto">
              <RefreshButton
                onClick={() => refresh.mutate()}
                isPending={refresh.isPending}
                title="Atualizar ARP"
              />
            </div>
          )}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed mb-4 max-w-4xl">
          {arp.objeto || "—"}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Metric label="Valor total" value={fmtMoney(arp.valorTotal)} big />
          <Metric
            label="Valor empenhado"
            value={fmtMoney(ag.valorEmp)}
            sub={`${pct(ag.valorEmp, arp.valorTotal)}% de execução financeira`}
          />
          <Metric
            label="Saldo disponível"
            value={fmtMoney(ag.valorSaldo)}
            sub="pode ser empenhado"
          />
          <Metric
            label="Itens na ata"
            value={fmtNum(arp.quantidadeItens ?? items.length)}
            sub={`${fmtNum(ag.totalReg)} unidades registradas`}
          />
        </div>
        <VigenciaTimeline
          inicial={arp.dataVigenciaInicial}
          final={arp.dataVigenciaFinal}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Itens da ata</h3>
          {!isLoading && items.length > 0 && (
            <button
              onClick={toggleAllItems}
              className="text-sm px-3 py-1 rounded border border-govbr-blue text-govbr-blue hover:bg-govbr-lightblue"
            >
              {expandedItems.size === items.length
                ? "Fechar todos"
                : "Abrir todos"}
            </button>
          )}
        </div>
        {isLoading && (
          <div className="text-sm text-slate-500 text-center py-6">
            Carregando itens…
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-md p-6 text-center text-sm text-slate-500">
            {jobActive
              ? "Aguardando sincronização desta ARP…"
              : "Nenhum item carregado para esta ARP. Use o botão de atualizar acima."}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <ItemCard
              key={it.numeroItem}
              codigoUasg={codigoUasg}
              ata={ata}
              item={it}
              lastSync={lastSync}
              empenhos={empenhosByItem?.[it.numeroItem]}
              suppliers={suppliers}
              expanded={expandedItems.has(it.numeroItem)}
              onToggle={() => toggleItem(it.numeroItem)}
              jobActive={jobActive}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
        {label}
      </div>
      <div
        className={`font-semibold tabular-nums text-slate-900 ${big ? "text-xl" : "text-lg"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-700 mt-1">{sub}</div>}
    </div>
  );
}
