import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/uasg/$codigoUasg/")({
  component: () => (
    <section className="flex-1 min-w-0">
      <div className="bg-white border border-slate-200 rounded-md p-10 text-center text-sm text-slate-500">
        Selecione uma ARP na barra lateral.
      </div>
    </section>
  ),
});
