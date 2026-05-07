import { useUasgJob } from "../api/queries";

export function SyncBadge({ codigoUasg }: { codigoUasg: string }) {
  const { data } = useUasgJob(codigoUasg);
  const job = data?.job;
  if (!job) return null;

  const active = job.status === "queued" || job.status === "running";
  if (active) {
    const frac =
      job.totalArps > 0
        ? `${job.processedArps + job.failedArps}/${job.totalArps}`
        : "…";
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] tracking-wider bg-white/10 border border-white/25">
        <span className="w-2 h-2 rounded-full bg-govbr-warn animate-pulse-dot" />
        Sincronizando ARPs {frac}
        {job.failedArps > 0 ? ` · ${job.failedArps} falhas` : ""}
      </span>
    );
  }
  if (job.status === "failed" || job.failedArps > 0) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] tracking-wider bg-govbr-danger/30 border border-red-300/40">
        <span className="w-2 h-2 rounded-full bg-govbr-danger" />
        {job.failedArps > 0
          ? `${job.failedArps} ARPs com falha na sincronização`
          : "Falha na sincronização"}
      </span>
    );
  }
  return null;
}
