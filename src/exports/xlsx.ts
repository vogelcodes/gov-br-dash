import ExcelJS from "exceljs";
import type { ArpComparisonBundle, UasgComparisonBundle } from "./serializer.js";
import { formatDateBr } from "./format.js";

export async function renderComparisonXlsx(
  bundle: ArpComparisonBundle,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "gov-br-dash";
  wb.created = new Date(bundle.generatedAt);

  buildResumoSheet(wb, bundle);
  buildArpItemsSheet(wb, bundle);
  buildEmpenhosComprasSheet(wb, bundle);
  buildEmpenhosPortalSheet(wb, bundle);
  buildContratosSheet(wb, bundle);
  buildSancoesSheet(wb, bundle);
  buildEmpresasSheet(wb, bundle);
  buildComparacaoSheet(wb, bundle);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildResumoSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Resumo");
  const arp = bundle.arp;
  const rows: [string, unknown][] = [
    ["Número ATA", arp.numeroAtaRegistroPreco],
    ["Número Controle PNCP", arp.numeroControlePncpAta],
    ["UASG", `${arp.codigoUnidadeGerenciadora} — ${arp.nomeUnidadeGerenciadora}`],
    ["Órgão", `${arp.codigoOrgao} — ${arp.nomeOrgao}`],
    ["Modalidade", arp.nomeModalidadeCompra],
    ["Vigência inicial", formatDateBr(arp.dataVigenciaInicial)],
    ["Vigência final", formatDateBr(arp.dataVigenciaFinal)],
    ["Valor total", arp.valorTotal],
    ["Status", arp.statusAta],
    ["Quantidade itens (compras)", arp.quantidadeItens],
    ["Itens persistidos", bundle.items.length],
    ["Empenhos Compras", bundle.empenhosCompras.length],
    ["Empenhos Portal", bundle.empenhosPortal.length],
    ["Contratos Portal", bundle.contratos.length],
    ["Gerado em", formatDateBr(bundle.generatedAt)],
  ];
  for (const [label, value] of rows) {
    ws.addRow([label, value]);
  }
  styleHeaderColumn(ws, 1);
  autoSizeColumns(ws);
}

function buildArpItemsSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("ARP Items");
  ws.addRow([
    "numeroItem",
    "descricaoItem",
    "tipoItem",
    "niFornecedor",
    "nomeRazaoSocialFornecedor",
    "quantidadeHomologadaItem",
    "quantidadeHomologadaVencedor",
    "valorUnitario",
    "valorTotal",
    "situacaoSicaf",
    "itemExcluido",
  ]);
  for (const item of bundle.items) {
    ws.addRow([
      item.numeroItem,
      item.descricaoItem,
      item.tipoItem ?? "",
      item.niFornecedor ?? "",
      item.nomeRazaoSocialFornecedor ?? "",
      item.quantidadeHomologadaItem ?? "",
      item.quantidadeHomologadaVencedor ?? "",
      item.valorUnitario ?? "",
      item.valorTotal ?? "",
      item.situacaoSicaf ?? "",
      item.itemExcluido ?? false,
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws);
}

function buildEmpenhosComprasSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Empenhos Compras");
  ws.addRow(["numeroItem", "id", "raw_json"]);
  for (const row of bundle.empenhosCompras) {
    ws.addRow([
      row.numeroItem,
      readField(row.raw, "id") ?? "",
      JSON.stringify(row.raw),
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 80 });
}

function buildEmpenhosPortalSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Empenhos Portal");
  ws.addRow([
    "documento",
    "cnpj",
    "ano",
    "fase",
    "valor",
    "dataEmissao",
    "lastSyncedAt",
  ]);
  for (const row of bundle.empenhosPortal) {
    ws.addRow([
      row.documento,
      row.cnpj,
      row.ano,
      row.fase,
      readField(row.raw, "valor") ?? "",
      formatDateBr(readField(row.raw, "dataEmissao") ?? ""),
      row.lastSyncedAt,
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws);
}

function buildContratosSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Contratos");
  ws.addRow([
    "contratoId",
    "cnpj",
    "objeto",
    "dataInicio",
    "dataFim",
    "valorInicial",
    "lastSyncedAt",
  ]);
  for (const row of bundle.contratos) {
    ws.addRow([
      row.contratoId,
      row.cnpj,
      readField(row.raw, "objeto") ?? "",
      formatDateBr(readField(row.raw, "dataInicioVigencia") ?? readField(row.raw, "dataAssinatura") ?? ""),
      formatDateBr(readField(row.raw, "dataFimVigencia") ?? ""),
      readField(row.raw, "valorInicial") ?? "",
      row.lastSyncedAt,
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildSancoesSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Sanções");
  ws.addRow(["cnpj", "fonte", "tipoSancao", "dataInicio", "dataFim", "raw_json"]);
  for (const [cnpj, list] of Object.entries(bundle.sancoesByCnpj)) {
    for (const row of list) {
      ws.addRow([
        cnpj,
        row.source.toUpperCase(),
        readField(row.raw, "tipoSancao") ??
          readField(row.raw, "descricaoTipo") ??
          "",
        formatDateBr(readField(row.raw, "dataInicioSancao") ?? ""),
        formatDateBr(readField(row.raw, "dataFimSancao") ?? ""),
        JSON.stringify(row.raw),
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 80 });
}

function buildEmpresasSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Empresas");
  ws.addRow(["cnpj", "razaoSocial", "nomeFantasia", "raw_json"]);
  for (const [cnpj, raw] of Object.entries(bundle.pessoasJuridicasByCnpj)) {
    ws.addRow([
      cnpj,
      readField(raw, "razaoSocial") ?? readField(raw, "razaoSocialReceita") ?? "",
      readField(raw, "nomeFantasia") ?? readField(raw, "nomeFantasiaReceita") ?? "",
      JSON.stringify(raw),
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 80 });
}

function buildComparacaoSheet(
  wb: ExcelJS.Workbook,
  bundle: ArpComparisonBundle,
): void {
  const ws = wb.addWorksheet("Comparação");
  ws.addRow([
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
  ]);
  for (const row of bundle.comparison) {
    ws.addRow([
      row.numeroItem,
      row.niFornecedor ?? "",
      row.nomeRazaoSocialFornecedor ?? "",
      row.descricaoItem ?? "",
      row.quantidadeHomologadaVencedor ?? "",
      row.valorTotalHomologado ?? "",
      row.comprasEmpenhoCount,
      row.comprasValorEmpenhado,
      row.portalEmpenhoCount,
      row.portalValorEmpenhado,
      row.diferencaValor,
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws);
}

function styleHeaderRow(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function styleHeaderColumn(ws: ExcelJS.Worksheet, col: number): void {
  ws.getColumn(col).font = { bold: true };
}

function autoSizeColumns(
  ws: ExcelJS.Worksheet,
  opts: { maxWidth?: number } = {},
): void {
  const maxWidth = opts.maxWidth ?? 50;
  ws.columns?.forEach((column) => {
    let max = 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    column.width = Math.min(maxWidth, max + 2);
  });
}

export async function renderUasgXlsx(
  bundle: UasgComparisonBundle,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "gov-br-dash";
  wb.created = new Date(bundle.generatedAt);

  buildUasgResumoSheet(wb, bundle);
  buildUasgArpsSheet(wb, bundle);
  buildUasgItemsSheet(wb, bundle);
  buildUasgEmpenhosComprasSheet(wb, bundle);
  buildUasgEmpenhosPortalSheet(wb, bundle);
  buildUasgContratosSheet(wb, bundle);
  buildUasgSancoesSheet(wb, bundle);
  buildUasgComparacaoSheet(wb, bundle);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildUasgResumoSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Resumo");
  const rows: [string, unknown][] = [
    ["UASG", bundle.codigoUasg],
    ["Nome", bundle.nomeUasg ?? ""],
    ["ARPs", bundle.totals.arps],
    ["Itens", bundle.totals.items],
    ["Empenhos Compras", bundle.totals.empenhosCompras],
    ["Empenhos Portal", bundle.totals.empenhosPortal],
    ["Contratos Portal", bundle.totals.contratos],
    ["Valor total das ARPs", bundle.totals.valorTotalArps],
    ["Valor empenhado (Compras)", bundle.totals.valorEmpenhadoCompras],
    ["Valor empenhado (Portal)", bundle.totals.valorEmpenhadoPortal],
    ["Gerado em", formatDateBr(bundle.generatedAt)],
  ];
  for (const [label, value] of rows) ws.addRow([label, value]);
  styleHeaderColumn(ws, 1);
  autoSizeColumns(ws);
}

function buildUasgArpsSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("ARPs");
  ws.addRow([
    "numeroAta",
    "numeroControlePncpAta",
    "modalidade",
    "vigenciaInicial",
    "vigenciaFinal",
    "valorTotal",
    "quantidadeItens",
    "itensPersistidos",
    "empenhosCompras",
    "empenhosPortal",
    "contratosPortal",
    "objeto",
  ]);
  for (const b of bundle.arpBundles) {
    const portalCount = b.empenhosPortal.length;
    ws.addRow([
      b.arp.numeroAtaRegistroPreco,
      b.arp.numeroControlePncpAta,
      b.arp.nomeModalidadeCompra,
      formatDateBr(b.arp.dataVigenciaInicial),
      formatDateBr(b.arp.dataVigenciaFinal),
      b.arp.valorTotal,
      b.arp.quantidadeItens,
      b.items.length,
      b.empenhosCompras.length,
      portalCount,
      b.contratos.length,
      b.arp.objeto ?? "",
    ]);
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildUasgItemsSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Itens");
  ws.addRow([
    "numeroControlePncpAta",
    "numeroItem",
    "descricaoItem",
    "niFornecedor",
    "nomeRazaoSocialFornecedor",
    "quantidadeHomologadaVencedor",
    "valorUnitario",
    "valorTotal",
  ]);
  for (const b of bundle.arpBundles) {
    for (const item of b.items) {
      ws.addRow([
        b.arp.numeroControlePncpAta,
        item.numeroItem,
        item.descricaoItem,
        item.niFornecedor ?? "",
        item.nomeRazaoSocialFornecedor ?? "",
        item.quantidadeHomologadaVencedor ?? "",
        item.valorUnitario ?? "",
        item.valorTotal ?? "",
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildUasgEmpenhosComprasSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Empenhos Compras");
  ws.addRow(["numeroControlePncpAta", "numeroItem", "id", "raw_json"]);
  for (const b of bundle.arpBundles) {
    for (const row of b.empenhosCompras) {
      ws.addRow([
        b.arp.numeroControlePncpAta,
        row.numeroItem,
        readField(row.raw, "id") ?? "",
        JSON.stringify(row.raw),
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 80 });
}

function buildUasgEmpenhosPortalSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Empenhos Portal");
  ws.addRow([
    "numeroControlePncpAta",
    "documento",
    "cnpj",
    "ano",
    "fase",
    "valor",
    "dataEmissao",
  ]);
  for (const b of bundle.arpBundles) {
    for (const row of b.empenhosPortal) {
      ws.addRow([
        b.arp.numeroControlePncpAta,
        row.documento,
        row.cnpj,
        row.ano,
        row.fase,
        readField(row.raw, "valor") ?? "",
        formatDateBr(readField(row.raw, "dataEmissao") ?? ""),
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildUasgContratosSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Contratos");
  ws.addRow([
    "numeroControlePncpAta",
    "contratoId",
    "cnpj",
    "objeto",
    "dataInicio",
    "dataFim",
    "valorInicial",
  ]);
  for (const b of bundle.arpBundles) {
    for (const row of b.contratos) {
      ws.addRow([
        b.arp.numeroControlePncpAta,
        row.contratoId,
        row.cnpj,
        readField(row.raw, "objeto") ?? "",
        formatDateBr(
          readField(row.raw, "dataInicioVigencia") ??
            readField(row.raw, "dataAssinatura") ??
            "",
        ),
        formatDateBr(readField(row.raw, "dataFimVigencia") ?? ""),
        readField(row.raw, "valorInicial") ?? "",
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildUasgSancoesSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Sanções");
  ws.addRow(["cnpj", "fonte", "tipoSancao", "dataInicio", "dataFim"]);
  const seenCnpj = new Set<string>();
  for (const b of bundle.arpBundles) {
    for (const [cnpj, list] of Object.entries(b.sancoesByCnpj)) {
      const key = `${cnpj}`;
      if (seenCnpj.has(key)) continue;
      seenCnpj.add(key);
      for (const row of list) {
        ws.addRow([
          cnpj,
          row.source.toUpperCase(),
          readField(row.raw, "tipoSancao") ??
            readField(row.raw, "descricaoTipo") ??
            "",
          formatDateBr(readField(row.raw, "dataInicioSancao") ?? ""),
          formatDateBr(readField(row.raw, "dataFimSancao") ?? ""),
        ]);
      }
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws, { maxWidth: 60 });
}

function buildUasgComparacaoSheet(
  wb: ExcelJS.Workbook,
  bundle: UasgComparisonBundle,
): void {
  const ws = wb.addWorksheet("Comparação");
  ws.addRow([
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
  ]);
  for (const b of bundle.arpBundles) {
    for (const row of b.comparison) {
      ws.addRow([
        b.arp.numeroAtaRegistroPreco,
        b.arp.numeroControlePncpAta,
        row.numeroItem,
        row.niFornecedor ?? "",
        row.nomeRazaoSocialFornecedor ?? "",
        row.descricaoItem ?? "",
        row.quantidadeHomologadaVencedor ?? "",
        row.valorTotalHomologado ?? "",
        row.comprasEmpenhoCount,
        row.comprasValorEmpenhado,
        row.portalEmpenhoCount,
        row.portalValorEmpenhado,
        row.diferencaValor,
      ]);
    }
  }
  styleHeaderRow(ws);
  autoSizeColumns(ws);
}

function readField(obj: unknown, key: string): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}
