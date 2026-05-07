import { createFileRoute, useParams } from "@tanstack/react-router";
import { useArpsSummary, useUasgJob } from "../api/queries";
import { ArpDetailPanel } from "../components/ArpDetailPanel";

export const Route = createFileRoute("/uasg/$codigoUasg/arp/$ata")({
  component: ArpRoute,
});

function ArpRoute() {
  const { codigoUasg, ata } = useParams({
    from: "/uasg/$codigoUasg/arp/$ata",
  });
  const summaryQ = useArpsSummary(codigoUasg);
  const jobQ = useUasgJob(codigoUasg);
  const job = jobQ.data?.job;
  const jobActive = job?.status === "queued" || job?.status === "running";
  const summary = summaryQ.data?.arps.find(
    (a) => a.arp.numeroControlePncpAta === ata,
  );

  if (summaryQ.isLoading) {
    return (
      <section className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-sm text-slate-500">
          Carregando ARP…
        </div>
      </section>
    );
  }
  if (!summary) {
    return (
      <section className="flex-1 min-w-0">
        <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-sm text-slate-500">
          ARP não encontrada para esta UASG.
        </div>
      </section>
    );
  }
  return (
    <ArpDetailPanel
      codigoUasg={codigoUasg}
      arp={summary.arp}
      jobActive={jobActive}
    />
  );
}
