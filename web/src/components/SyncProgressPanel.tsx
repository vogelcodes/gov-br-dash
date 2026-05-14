import type { SyncJob } from "../api/types";
import { RefreshButton } from "./RefreshButton";

interface Props {
  job: SyncJob | null;
  isPending: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
}

const DONE_GRACE_MS = 30_000;

export function SyncProgressPanel({
  job,
  isPending,
  onRetry,
  retryDisabled,
}: Props) {
  const active =
    isPending || job?.status === "queued" || job?.status === "running";
  const recentlyDone =
    job?.status === "done" &&
    job.finishedAt != null &&
    Date.now() - Date.parse(job.finishedAt) < DONE_GRACE_MS;
  if (
    !active &&
    job?.status !== "failed" &&
    job?.status !== "interrupted" &&
    !recentlyDone
  )
    return null;

  const durationSec =
    job?.startedAt && job?.finishedAt
      ? Math.max(
          0,
          Math.round(
            (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000,
          ),
        )
      : null;

  const p = job;
  const isRunning = job?.status === "running" || job?.status === "queued";
  // When mutation is pending but server hasn't responded yet, treat as "arps" phase
  const phase = isRunning ? (p?.phase ?? "arps") : isPending ? "arps" : null;
  const total = p?.totalArps ?? 0;
  const done = p?.processedArps ?? 0;
  const failed = p?.failedArps ?? 0;

  const pastArps = total > 0;
  const isPortalPhase = phase === "portal-supplier";
  const itemPage = p?.currentArpItemPage;
  const itemTotalPages = p?.currentArpItemTotalPages;
  const itemsArpDetail =
    pastArps && phase !== "arps" && !isPortalPhase
      ? `${done + failed}/${total} ARPs`
      : undefined;
  const itemsPageDetail =
    phase === "items" &&
    itemPage != null &&
    itemTotalPages != null &&
    itemTotalPages > 1
      ? `pág. ${itemPage}/${itemTotalPages}`
      : undefined;
  const cnpjDetail =
    isPortalPhase && pastArps ? `${done + failed}/${total} CNPJs` : undefined;
  const cnpjSubDetail =
    isPortalPhase && p?.currentArp ? formatCnpj(p.currentArp) : undefined;

  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-md px-4 py-3 flex flex-col gap-2 min-w-[280px]">
      <PhaseRow
        label="ARPs"
        state={phase === "arps" ? "running" : pastArps ? "done" : "waiting"}
        detail={pastArps && !isPortalPhase ? `${total} encontradas` : undefined}
      />
      <PhaseRow
        label="Itens"
        state={
          phase === "items"
            ? "running"
            : phase === "empenhos" || isPortalPhase || (!active && pastArps)
              ? "done"
              : "waiting"
        }
        detail={itemsArpDetail}
        subDetail={itemsPageDetail}
      />
      <PhaseRow
        label="Empenhos"
        state={
          phase === "empenhos"
            ? "running"
            : isPortalPhase || (!active && pastArps)
              ? "done"
              : "waiting"
        }
        detail={
          pastArps && (phase === "empenhos" || !active) && !isPortalPhase
            ? `${done + failed}/${total} ARPs`
            : undefined
        }
      />
      <PhaseRow
        label="CNPJs"
        state={
          isPortalPhase ? "running" : !active && pastArps ? "done" : "waiting"
        }
        detail={cnpjDetail}
        subDetail={cnpjSubDetail}
      />
      <div className="flex justify-between">
        {(p?.failedArps ?? 0) > 0 && (
          <div className="text-[11px] text-govbr-danger mt-1">
            {p!.failedArps} ARP{p!.failedArps > 1 ? "s" : ""} com falha
            {p?.lastError ? ` · ${p.lastError}` : ""}
          </div>
        )}
        {durationSec != null && job?.status === "done" && (
          <div className="text-[11px] text-emerald-700 mt-1">
            Concluído em {formatDuration(durationSec)}
          </div>
        )}
        {durationSec != null && job?.status === "failed" && (
          <div className="text-[11px] text-govbr-danger mt-1">
            Falhou após {formatDuration(durationSec)}
            {p?.lastError ? ` · ${p.lastError}` : ""}
          </div>
        )}
        {job?.status === "failed" &&
          (p?.failedArps ?? 0) === 0 &&
          durationSec == null && (
            <div className="text-[11px] text-govbr-danger mt-1">
              Falha na sincronização{p?.lastError ? ` · ${p.lastError}` : ""}
            </div>
          )}
        {job?.status === "interrupted" && (
          <div className="text-[11px] text-amber-600 mt-1">
            Servidor reiniciado · retomando automaticamente…
          </div>
        )}
        {(job?.status === "failed" || job?.status === "interrupted") &&
          onRetry && (
            <RefreshButton
              onClick={onRetry}
              isPending={isPending}
              title="Tentar novamente"
              disabled={retryDisabled}
            />
          )}
      </div>
    </div>
  );
}

function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function PhaseRow({
  label,
  state,
  detail,
  subDetail,
}: {
  label: string;
  state: "waiting" | "running" | "done";
  detail?: string;
  subDetail?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
        {state === "done" && (
          <svg
            className="w-4 h-4 text-emerald-600"
            fill="none"
            viewBox="0 0 16 16"
          >
            <circle
              cx="8"
              cy="8"
              r="7"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M5 8l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {state === "running" && (
          <span className="w-3 h-3 rounded-full bg-govbr-blue animate-pulse-dot block" />
        )}
        {state === "waiting" && (
          <span className="w-3 h-3 rounded-full border border-slate-300 block" />
        )}
      </div>
      <span
        className={`text-sm flex-1 ${
          state === "done"
            ? "text-slate-700"
            : state === "running"
              ? "font-medium text-slate-900"
              : "text-slate-400"
        }`}
      >
        {label}
      </span>
      <div className="flex flex-col items-end gap-0.5">
        {detail && (
          <span className="text-[11px] tabular-nums text-slate-500">
            {detail}
          </span>
        )}
        {subDetail && (
          <span className="text-[10px] tabular-nums text-govbr-blue">
            {subDetail}
          </span>
        )}
      </div>
    </div>
  );
}
