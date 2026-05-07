import {
  Outlet,
  createFileRoute,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { useArpsSummary, useQuota, useTriggerSync, useUasgJob, useUasgs } from "../api/queries";
import { arpsApi } from "../api/arps";
import { ArpSidebar } from "../components/ArpSidebar";
import { ExportMenu } from "../components/ExportMenu";
import { KpiStrip } from "../components/KpiStrip";
import { SyncBadge } from "../components/SyncBadge";
import { SyncProgressPanel } from "../components/SyncProgressPanel";

export const Route = createFileRoute("/uasg/$codigoUasg")({
  component: UasgDashboard,
});

function UasgDashboard() {
  const { codigoUasg } = useParams({ from: "/uasg/$codigoUasg" });
  const summaryQ = useArpsSummary(codigoUasg);
  const uasgsQ = useUasgs();
  const triggerSync = useTriggerSync(codigoUasg);
  const jobQ = useUasgJob(codigoUasg, triggerSync.isPending);
  const quotaQ = useQuota();
  const summaries = summaryQ.data?.arps ?? [];
  const uasg = uasgsQ.data?.uasgs.find((u) => u.codigoUasg === codigoUasg);
  const job = jobQ.data?.job ?? null;
  const jobActive =
    triggerSync.isPending ||
    job?.status === "queued" ||
    job?.status === "running";
  const quota = quotaQ.data;
  const canSync = !jobActive && (quota?.remaining ?? 1) > 0;

  // Selected ARP comes from the child route's URL (we live above the outlet)
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const selectedAta = (() => {
    const m = pathname.match(/\/uasg\/[^/]+\/arp\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  })();

  return (
    <div className="min-h-[calc(100vh-44px)] bg-slate-100">
      <div className="bg-govbr-navy text-white px-6 py-2 flex items-center gap-3 text-xs">
        <span className="opacity-80">UASG {codigoUasg}</span>
        {uasg?.nomeUasg && <span className="opacity-80">· {uasg.nomeUasg}</span>}
        <div className="ml-auto">
          <SyncBadge codigoUasg={codigoUasg} />
        </div>
      </div>
      <header className="bg-white border-b border-slate-200 px-6 py-6">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex items-end gap-4 flex-wrap mb-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                Gestor · {uasg?.nomeUasg || codigoUasg}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight mt-1">
                Minhas Atas de Registro de Preços
              </h1>
              <p className="text-sm text-slate-700 mt-2">
                Acompanhe a execução financeira e quantitativa dos itens
                registrados nas suas ARPs.
              </p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <div className="flex items-center gap-3">
                <ExportMenu
                  csvUrl={arpsApi.exportUasgUrl(codigoUasg, "csv")}
                  xlsxUrl={arpsApi.exportUasgUrl(codigoUasg, "xlsx")}
                  label="Exportar UASG"
                  disabled={summaries.length === 0}
                />
                <button
                  type="button"
                  onClick={() => triggerSync.mutate()}
                  disabled={!canSync}
                  className="btn-secondary"
                  title={
                    jobActive
                      ? "Sincronização em andamento"
                      : quota && quota.remaining <= 0
                        ? `Cota mensal esgotada (${quota.used}/${quota.limit})`
                        : undefined
                  }
                >
                  {jobActive ? "Sincronizando…" : "Sincronizar UASG"}
                </button>
              </div>
              {quota && (
                <span className="text-[11px] text-slate-500">
                  {quota.remaining}/{quota.limit} sincronizações restantes este mês
                </span>
              )}
              <SyncProgressPanel job={job} isPending={triggerSync.isPending} />
            </div>
          </div>
          <KpiStrip summaries={summaries} />
        </div>
      </header>
      <div className="max-w-[1440px] mx-auto px-6 py-6 flex gap-5 items-start flex-wrap lg:flex-nowrap">
        <ArpSidebar
          codigoUasg={codigoUasg}
          summaries={summaries}
          selectedAta={selectedAta}
          jobActive={jobActive}
        />
        <Outlet />
      </div>
    </div>
  );
}
