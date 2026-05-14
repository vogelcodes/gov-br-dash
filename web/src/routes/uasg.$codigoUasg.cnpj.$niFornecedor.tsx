import { Fragment, useEffect, useState } from "react";
import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { usePostHog } from "posthog-js/react";
import {
  useSupplierPortalSummary,
  useTriggerSupplierPortalSync,
} from "../api/queries";
import type {
  PortalContratoRow,
  PortalEmpenhoRow,
  PortalSancaoRow,
} from "../api/suppliers";
import { fmtCnpj, fmtMoney } from "../lib/format";
import { EmpenhoDetailPanel } from "../components/EmpenhoDetailPanel";
import { staleness } from "../lib/staleness";
import { StaleBadge, staleTintClass } from "../components/StaleBadge";

export const Route = createFileRoute("/uasg/$codigoUasg/cnpj/$niFornecedor")({
  component: SupplierPortalPage,
});

function SupplierPortalPage() {
  const { codigoUasg, niFornecedor } = useParams({
    from: "/uasg/$codigoUasg/cnpj/$niFornecedor",
  });
  const summaryQ = useSupplierPortalSummary(niFornecedor);
  const triggerSync = useTriggerSupplierPortalSync(niFornecedor);
  const posthog = usePostHog();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [autoSyncTried, setAutoSyncTried] = useState(false);

  const data = summaryQ.data;
  const pessoa = data?.pessoa?.raw as
    | (Record<string, unknown> & {
        razaoSocial?: string;
        nomeFantasia?: string;
        sancionadoCEIS?: boolean;
        sancionadoCNEP?: boolean;
        sancionadoCEPIM?: boolean;
        sancionadoCEAF?: boolean;
        possuiContratacao?: boolean;
        emitiuNFe?: boolean;
        participanteLicitacao?: boolean;
        favorecidoDespesas?: boolean;
        convenios?: boolean;
      })
    | undefined;
  const empenhos = data?.empenhos ?? [];
  const contratos = data?.contratos ?? [];
  const sancoes = data?.sancoes ?? [];

  // Auto-trigger a portal sync if the supplier has never been synced — saves
  // the user a button click on first visit. Runs once per page mount.
  useEffect(() => {
    if (!summaryQ.isFetched) return;
    if (autoSyncTried) return;
    if (data?.pessoa?.lastSyncedAt) {
      // Pessoa cached but check if portal data exists
      if (empenhos.length === 0 && contratos.length === 0) {
        setAutoSyncTried(true);
        triggerSync.mutate();
      }
      return;
    }
    if (!data?.pessoa) {
      setAutoSyncTried(true);
      triggerSync.mutate();
    }
  }, [
    summaryQ.isFetched,
    autoSyncTried,
    data?.pessoa,
    empenhos.length,
    contratos.length,
    triggerSync,
  ]);

  const toggle = (documento: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(documento)) {
        next.delete(documento);
      } else {
        next.add(documento);
        posthog.capture("empenho_details_expanded", {
          codigo_uasg: codigoUasg,
          ni_fornecedor: niFornecedor,
        });
      }
      return next;
    });
  };

  if (summaryQ.isLoading) {
    return (
      <section className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-sm text-slate-500">
          Carregando dados do fornecedor…
        </div>
      </section>
    );
  }
  if (summaryQ.isError) {
    return (
      <section className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-sm text-slate-500">
          Fornecedor não encontrado para esta UASG ou sem dados sincronizados.
          <div className="mt-2">
            <Link
              to="/uasg/$codigoUasg"
              params={{ codigoUasg }}
              className="text-govbr-blue hover:underline"
            >
              ← Voltar para a UASG
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const razaoSocial = pessoa?.razaoSocial ?? "Fornecedor";
  const nomeFantasia =
    pessoa?.nomeFantasia && pessoa.nomeFantasia !== "-"
      ? pessoa.nomeFantasia
      : null;

  const totalEmpenhado = empenhos.reduce(
    (acc, row) => acc + (toNumber(row.raw["valor"]) ?? 0),
    0,
  );
  const totalContratos = contratos.reduce(
    (acc, row) => acc + (toNumber(row.raw["valorInicial"]) ?? 0),
    0,
  );

  const supplierStale = staleness(data?.pessoa?.lastSyncedAt, "supplier");

  return (
    <section className="flex-1 min-w-0 flex flex-col gap-4">
      {/* HEADER */}
      <div className={`panel relative ${staleTintClass(supplierStale)}`}>
        <div className="absolute top-3 right-3">
          <StaleBadge
            level={supplierStale}
            lastChangedAt={data?.pessoa?.lastSyncedAt}
          />
        </div>
        <div className="flex items-start gap-3 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-medium text-slate-900">
              {razaoSocial}
            </h2>
            {nomeFantasia && (
              <p className="text-sm text-slate-700 mt-0.5">{nomeFantasia}</p>
            )}
            <p className="text-sm text-slate-700 mt-1 tabular-nums">
              CNPJ {fmtCnpj(niFornecedor)}
            </p>
          </div>
          <Link
            to="/uasg/$codigoUasg"
            params={{ codigoUasg }}
            className="text-sm text-govbr-blue hover:underline"
          >
            ← UASG {codigoUasg}
          </Link>
        </div>

        {pessoa && <EmpresaBadges pessoa={pessoa} />}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Metric
            label="Empenhos (Portal)"
            value={String(empenhos.length)}
            big
          />
          <Metric label="Total empenhado" value={fmtMoney(totalEmpenhado)} />
          <Metric label="Contratos (Portal)" value={String(contratos.length)} />
          <Metric label="Total contratado" value={fmtMoney(totalContratos)} />
        </div>

        <div className="flex gap-2 items-center mt-4 flex-wrap">
          <button
            type="button"
            onClick={() => {
              posthog.capture("supplier_portal_sync_triggered", {
                codigo_uasg: codigoUasg,
                ni_fornecedor: niFornecedor,
              });
              triggerSync.mutate();
            }}
            disabled={triggerSync.isPending}
            className="text-sm px-3 py-1 rounded border border-govbr-blue text-govbr-blue hover:bg-govbr-lightblue disabled:opacity-50"
            title="Buscar contratos, empenhos e sanções no Portal da Transparência"
          >
            {triggerSync.isPending
              ? "Sincronizando…"
              : "Sincronizar dados do Portal"}
          </button>
          {data?.pessoa?.lastSyncedAt && (
            <span className="text-[11px] text-slate-500">
              empresa atualizada:{" "}
              {new Date(data.pessoa.lastSyncedAt).toLocaleString("pt-BR")}
            </span>
          )}
          {triggerSync.isError && (
            <span className="text-[11px] text-govbr-danger">
              Falha ao sincronizar
            </span>
          )}
          {triggerSync.isSuccess && (
            <span className="text-[11px] text-slate-500">
              Sincronização concluída — dados atualizados
            </span>
          )}
        </div>
      </div>

      {/* EMPTY STATE */}
      {empenhos.length === 0 &&
        contratos.length === 0 &&
        sancoes.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-md p-6 text-sm text-slate-700">
            {triggerSync.isPending ? (
              <>
                Buscando dados no Portal da Transparência…
                <span className="block mt-1 text-slate-500">
                  Empenhos, contratos e sanções podem levar alguns segundos.
                </span>
              </>
            ) : (
              <>
                Sem dados do Portal da Transparência para este fornecedor.
                <span className="block mt-2 text-slate-500">
                  Use o botão "Sincronizar dados do Portal" acima para consultar
                  a API agora.
                </span>
              </>
            )}
          </div>
        )}

      {/* SANCOES */}
      {sancoes.length > 0 && <SancoesSection rows={sancoes} />}

      {/* CONTRATOS */}
      {contratos.length > 0 && <ContratosSection rows={contratos} />}

      {/* EMPENHOS */}
      {empenhos.length > 0 && (
        <EmpenhosSection rows={empenhos} expanded={expanded} toggle={toggle} />
      )}
    </section>
  );
}

function EmpresaBadges({
  pessoa,
}: {
  pessoa: {
    sancionadoCEIS?: boolean;
    sancionadoCNEP?: boolean;
    sancionadoCEPIM?: boolean;
    sancionadoCEAF?: boolean;
    possuiContratacao?: boolean;
    emitiuNFe?: boolean;
    participanteLicitacao?: boolean;
    favorecidoDespesas?: boolean;
    convenios?: boolean;
  };
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {pessoa.sancionadoCEIS && <Badge color="danger">CEIS</Badge>}
      {pessoa.sancionadoCNEP && <Badge color="danger">CNEP</Badge>}
      {pessoa.sancionadoCEPIM && <Badge color="danger">CEPIM</Badge>}
      {pessoa.sancionadoCEAF && <Badge color="danger">CEAF</Badge>}
      {pessoa.possuiContratacao && (
        <Badge color="success">Possui contrato</Badge>
      )}
      {pessoa.emitiuNFe && <Badge color="success">Emitiu NF-e</Badge>}
      {pessoa.participanteLicitacao && <Badge color="info">Licitações</Badge>}
      {pessoa.favorecidoDespesas && (
        <Badge color="info">Favorecido despesas</Badge>
      )}
      {pessoa.convenios && <Badge color="info">Convênios</Badge>}
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "danger" | "success" | "info";
  children: React.ReactNode;
}) {
  const cls =
    color === "danger"
      ? "bg-red-100 text-red-700"
      : color === "success"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-sky-100 text-sky-700";
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

function SancoesSection({ rows }: { rows: PortalSancaoRow[] }) {
  return (
    <div className="panel">
      <h3 className="text-lg font-medium mb-3">Sanções</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-700 text-xs uppercase">
          <tr>
            <th className="py-1">Fonte</th>
            <th className="py-1">Tipo</th>
            <th className="py-1">Início</th>
            <th className="py-1">Fim</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={`${s.source}-${s.idx}`}
              className="border-t border-slate-100"
            >
              <td className="py-1">{s.source.toUpperCase()}</td>
              <td className="py-1">
                {readField(s.raw, "tipoSancao") ??
                  readField(s.raw, "descricaoTipo") ??
                  "—"}
              </td>
              <td className="py-1">
                {readField(s.raw, "dataInicioSancao") ?? "—"}
              </td>
              <td className="py-1">
                {readField(s.raw, "dataFimSancao") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContratosSection({ rows }: { rows: PortalContratoRow[] }) {
  return (
    <div className="panel">
      <h3 className="text-lg font-medium mb-3">
        Contratos{" "}
        <span className="text-sm font-normal text-slate-500">
          ({rows.length})
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-700 text-xs uppercase">
            <tr>
              <th className="py-1">Número</th>
              <th className="py-1">Objeto</th>
              <th className="py-1">Início</th>
              <th className="py-1">Fim</th>
              <th className="py-1 text-right">Valor inicial</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const numero = readField(c.raw, "numero") ?? c.contratoId;
              const objeto = readField(c.raw, "objeto") ?? "—";
              const inicio =
                readField(c.raw, "dataInicioVigencia") ??
                readField(c.raw, "dataAssinatura") ??
                "—";
              const fim = readField(c.raw, "dataFimVigencia") ?? "—";
              const valor = toNumber(readField(c.raw, "valorInicial") ?? "");
              return (
                <tr key={c.contratoId} className="border-t border-slate-100">
                  <td className="py-1 tabular-nums">{numero}</td>
                  <td className="py-1 max-w-[420px] truncate" title={objeto}>
                    {objeto}
                  </td>
                  <td className="py-1 tabular-nums">{inicio}</td>
                  <td className="py-1 tabular-nums">{fim}</td>
                  <td className="py-1 text-right tabular-nums">
                    {valor != null ? fmtMoney(valor) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmpenhosSection({
  rows,
  expanded,
  toggle,
}: {
  rows: PortalEmpenhoRow[];
  expanded: Set<string>;
  toggle: (documento: string) => void;
}) {
  return (
    <div className="panel">
      <h3 className="text-lg font-medium mb-3">
        Empenhos{" "}
        <span className="text-sm font-normal text-slate-500">
          ({rows.length})
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-700 text-xs uppercase">
            <tr>
              <th className="py-1">Data</th>
              <th className="py-1">Documento</th>
              <th className="py-1 min-w-[200px]">Órgão</th>
              <th className="py-1 text-right">Valor</th>
              <th className="py-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.documento);
              const data = readField(row.raw, "data") ?? "—";
              const docResumido =
                readField(row.raw, "documentoResumido") ?? row.documento;
              const orgaoCodigo = readField(row.raw, "codigoOrgao") ?? "";
              const orgao = readField(row.raw, "orgao") ?? "";
              const observacao = readField(row.raw, "observacao") ?? "";
              const valor = toNumber(readField(row.raw, "valor") ?? "") ?? 0;
              return (
                <Fragment key={row.documento}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 tabular-nums">{data}</td>
                    <td className="py-2">
                      <a
                        href={`https://portaldatransparencia.gov.br/despesas/empenho/${row.documento}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-govbr-blue hover:underline tabular-nums"
                      >
                        {docResumido}
                      </a>
                    </td>
                    <td className="py-2 text-slate-800">
                      {orgaoCodigo ? `${orgaoCodigo} — ` : ""}
                      {orgao}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {fmtMoney(valor)}
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(row.documento)}
                        className="w-7 h-7 rounded text-slate-700 hover:bg-slate-200"
                        title={isOpen ? "Fechar detalhes" : "Abrir detalhes"}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <EmpenhoDetailPanel
                          documento={row.documento}
                          observacao={observacao}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function readField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}
