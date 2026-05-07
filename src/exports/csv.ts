import { stringify } from "csv-stringify/sync";
import type { ArpComparisonBundle, UasgComparisonBundle } from "./serializer.js";
import { formatCurrencyBrl, formatDateBr } from "./format.js";

const COMPARISON_HEADERS = [
  "numeroItem",
  "niFornecedor",
  "nomeRazaoSocialFornecedor",
  "descricaoItem",
  "quantidadeHomologadaVencedor",
  "valorTotalHomologado",
  "comprasEmpenhoCount",
  "comprasValorEmpenhado",
  "portalEmpenhoCount",
  "portalValorEmpenhado",
  "diferencaValor",
] as const;

export function renderComparisonCsv(bundle: ArpComparisonBundle): Buffer {
  const records = bundle.comparison.map((row) => ({
    numeroItem: row.numeroItem,
    niFornecedor: row.niFornecedor ?? "",
    nomeRazaoSocialFornecedor: row.nomeRazaoSocialFornecedor ?? "",
    descricaoItem: row.descricaoItem ?? "",
    quantidadeHomologadaVencedor: row.quantidadeHomologadaVencedor ?? "",
    valorTotalHomologado:
      row.valorTotalHomologado != null
        ? formatCurrencyBrl(row.valorTotalHomologado)
        : "",
    comprasEmpenhoCount: row.comprasEmpenhoCount,
    comprasValorEmpenhado: formatCurrencyBrl(row.comprasValorEmpenhado),
    portalEmpenhoCount: row.portalEmpenhoCount,
    portalValorEmpenhado: formatCurrencyBrl(row.portalValorEmpenhado),
    diferencaValor: formatCurrencyBrl(row.diferencaValor),
  }));

  const header = [
    `# ARP ${bundle.arp.numeroAtaRegistroPreco} (${bundle.arp.numeroControlePncpAta})`,
    `# UASG ${bundle.arp.codigoUnidadeGerenciadora} - ${bundle.arp.nomeUnidadeGerenciadora}`,
    `# Vigência: ${formatDateBr(bundle.arp.dataVigenciaInicial)} a ${formatDateBr(bundle.arp.dataVigenciaFinal)}`,
    `# Gerado em: ${formatDateBr(bundle.generatedAt)}`,
    "",
  ].join("\n");

  const csv = stringify(records, {
    header: true,
    columns: COMPARISON_HEADERS as unknown as string[],
    delimiter: ";",
    bom: true,
  });

  return Buffer.concat([Buffer.from(header, "utf8"), Buffer.from(csv, "utf8")]);
}

const UASG_COMPARISON_HEADERS = [
  "numeroAta",
  "numeroControlePncpAta",
  "numeroItem",
  "niFornecedor",
  "nomeRazaoSocialFornecedor",
  "descricaoItem",
  "quantidadeHomologadaVencedor",
  "valorTotalHomologado",
  "comprasEmpenhoCount",
  "comprasValorEmpenhado",
  "portalEmpenhoCount",
  "portalValorEmpenhado",
  "diferencaValor",
] as const;

export function renderUasgCsv(bundle: UasgComparisonBundle): Buffer {
  const records: Record<string, unknown>[] = [];
  for (const arpBundle of bundle.arpBundles) {
    for (const row of arpBundle.comparison) {
      records.push({
        numeroAta: arpBundle.arp.numeroAtaRegistroPreco,
        numeroControlePncpAta: arpBundle.arp.numeroControlePncpAta,
        numeroItem: row.numeroItem,
        niFornecedor: row.niFornecedor ?? "",
        nomeRazaoSocialFornecedor: row.nomeRazaoSocialFornecedor ?? "",
        descricaoItem: row.descricaoItem ?? "",
        quantidadeHomologadaVencedor: row.quantidadeHomologadaVencedor ?? "",
        valorTotalHomologado:
          row.valorTotalHomologado != null
            ? formatCurrencyBrl(row.valorTotalHomologado)
            : "",
        comprasEmpenhoCount: row.comprasEmpenhoCount,
        comprasValorEmpenhado: formatCurrencyBrl(row.comprasValorEmpenhado),
        portalEmpenhoCount: row.portalEmpenhoCount,
        portalValorEmpenhado: formatCurrencyBrl(row.portalValorEmpenhado),
        diferencaValor: formatCurrencyBrl(row.diferencaValor),
      });
    }
  }

  const header = [
    `# UASG ${bundle.codigoUasg}${bundle.nomeUasg ? ` — ${bundle.nomeUasg}` : ""}`,
    `# ARPs: ${bundle.totals.arps} · Itens: ${bundle.totals.items}`,
    `# Empenhos Compras: ${bundle.totals.empenhosCompras} · Empenhos Portal: ${bundle.totals.empenhosPortal} · Contratos: ${bundle.totals.contratos}`,
    `# Gerado em: ${formatDateBr(bundle.generatedAt)}`,
    "",
  ].join("\n");

  const csv = stringify(records, {
    header: true,
    columns: UASG_COMPARISON_HEADERS as unknown as string[],
    delimiter: ";",
    bom: true,
  });

  return Buffer.concat([Buffer.from(header, "utf8"), Buffer.from(csv, "utf8")]);
}
