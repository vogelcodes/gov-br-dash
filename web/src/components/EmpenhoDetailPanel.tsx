import { useEmpenhoDetail } from "../api/queries";
import { fmtMoney } from "../lib/format";

interface Props {
  documento: string;
  observacao: string;
}

export function EmpenhoDetailPanel({ documento, observacao }: Props) {
  const detailQ = useEmpenhoDetail(documento);
  const bundle = detailQ.data?.bundle;
  const itens = bundle?.itens ?? [];
  const relacionados = bundle?.relacionados ?? [];
  const historicoBySeq = new Map<
    number,
    { sequencial: number; idx: number; raw: Record<string, unknown> }[]
  >();
  for (const h of bundle?.historico ?? []) {
    const slot = historicoBySeq.get(h.sequencial) ?? [];
    slot.push(h);
    historicoBySeq.set(h.sequencial, slot);
  }

  return (
    <div className="px-6 py-4 bg-slate-50 border-y border-slate-200">
      {observacao && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
            Descrição
          </p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">
            {observacao}
          </p>
        </div>
      )}

      {detailQ.isLoading && (
        <p className="text-sm text-slate-500">Carregando detalhes…</p>
      )}

      {!detailQ.isLoading && itens.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
            Itens do empenho
          </p>
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-left text-slate-700 border-b border-slate-200">
                <th className="pr-3 py-1">Seq</th>
                <th className="pr-3 py-1">Descrição</th>
                <th className="pr-3 py-1">Subelemento</th>
                <th className="py-1 text-right">Valor Atual</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const desc = readField(item.raw, "descricao") ?? "";
                const subelem = `${readField(item.raw, "codigoSubelemento") ?? ""} — ${readField(item.raw, "descricaoSubelemento") ?? ""}`;
                const valorAtual = readField(item.raw, "valorAtual") ?? "";
                const historico = historicoBySeq.get(item.sequencial) ?? [];
                return (
                  <ItemRow
                    key={item.sequencial}
                    sequencial={item.sequencial}
                    desc={desc}
                    subelem={subelem}
                    valorAtual={valorAtual}
                    historico={historico}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!detailQ.isLoading && relacionados.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
            Documentos relacionados
          </p>
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-left text-slate-700 border-b border-slate-200">
                <th className="pr-3 py-1">Data</th>
                <th className="pr-3 py-1">Fase</th>
                <th className="pr-3 py-1">Documento</th>
                <th className="py-1">Espécie</th>
                <th className="py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {relacionados.map((rel) => {
                const fase = readField(rel.raw, "fase") ?? "";
                const documentoRel =
                  readField(rel.raw, "documento") ??
                  readField(rel.raw, "documentoRelacionado") ??
                  rel.related;
                const documentoLabel =
                  readField(rel.raw, "documentoResumido") ?? documentoRel;
                const data = readField(rel.raw, "data") ?? "";
                const especie = readField(rel.raw, "especie") ?? "";
                const valor = readField(rel.raw, "valor") ?? "";
                const faseSlug =
                  fase === "Liquidação"
                    ? "liquidacao"
                    : fase === "Pagamento"
                      ? "pagamento"
                      : "empenho";
                const url = `https://portaldatransparencia.gov.br/despesas/${faseSlug}/${documentoRel}`;
                return (
                  <tr
                    key={`${rel.related}-${rel.fase}`}
                    className="border-t border-slate-100"
                  >
                    <td className="pr-3 py-1 text-slate-600 tabular-nums">{data}</td>
                    <td className="pr-3 py-1 text-slate-800">{fase}</td>
                    <td className="pr-3 py-1">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-govbr-blue hover:underline"
                      >
                        {documentoLabel}
                      </a>
                    </td>
                    <td className="py-1 text-slate-600">{especie}</td>
                    <td className="py-1 text-right tabular-nums">
                      {valor ? fmtMoney(toNumber(valor) ?? 0) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!detailQ.isLoading && itens.length === 0 && relacionados.length === 0 && (
        <p className="text-xs text-slate-500">
          Sem itens nem documentos relacionados para este empenho.
        </p>
      )}
    </div>
  );
}

function ItemRow({
  sequencial,
  desc,
  subelem,
  valorAtual,
  historico,
}: {
  sequencial: number;
  desc: string;
  subelem: string;
  valorAtual: string;
  historico: { sequencial: number; idx: number; raw: Record<string, unknown> }[];
}) {
  return (
    <>
      <tr className="border-t border-slate-200 align-top">
        <td className="pr-3 py-1 text-slate-600 tabular-nums">{sequencial}</td>
        <td className="pr-3 py-1 text-slate-800">{desc}</td>
        <td className="pr-3 py-1 text-slate-600">{subelem}</td>
        <td className="py-1 text-right font-medium text-slate-800 tabular-nums">
          {valorAtual}
        </td>
      </tr>
      {historico.map((h) => {
        const data = readField(h.raw, "data") ?? "";
        const operacao = readField(h.raw, "operacao") ?? "";
        const quantidade = readField(h.raw, "quantidade") ?? "";
        const vUnit = readField(h.raw, "valorUnitario") ?? "";
        const vTotal = readField(h.raw, "valorTotal") ?? "";
        return (
          <tr key={`${h.sequencial}-${h.idx}`} className="bg-white">
            <td></td>
            <td
              colSpan={3}
              className="pr-3 py-0.5 pl-2 border-l-2 border-amber-300 text-[11px]"
            >
              <span className="text-slate-600 tabular-nums">{data}</span>
              <span className="ml-2 text-slate-800 font-medium">{operacao}</span>
              <span className="ml-2 text-slate-600 tabular-nums">
                {quantidade} × {vUnit}
              </span>
              <span className="ml-2 font-medium text-slate-800 tabular-nums">
                = {vTotal}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function readField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function toNumber(value: string): number | null {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}
