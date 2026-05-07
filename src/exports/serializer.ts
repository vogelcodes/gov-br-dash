import type { Arp, ArpItem } from "../clients/compras-gov.js";
import type {
  PortalContratoRow,
  PortalEmpenhoRow,
  PortalSancaoRow,
  SqlitePortalDataRepository,
} from "../db/portal-data-repository.js";
import type { SqliteSyncRepository } from "../db/sync-repository.js";
import { normalizeUasg } from "../services/user-uasgs.js";

export interface ArpComparisonBundle {
  arp: Arp;
  items: ArpItem[];
  pessoasJuridicasByCnpj: Record<string, unknown>;
  empenhosCompras: { numeroItem: string; raw: unknown }[];
  empenhosPortal: PortalEmpenhoRow[];
  contratos: PortalContratoRow[];
  sancoesByCnpj: Record<string, PortalSancaoRow[]>;
  comparison: ComparisonRow[];
  generatedAt: string;
}

export interface ComparisonRow {
  numeroItem: string;
  niFornecedor: string | null;
  nomeRazaoSocialFornecedor: string | null;
  descricaoItem: string | null;
  quantidadeHomologadaVencedor: number | null;
  valorTotalHomologado: number | null;
  comprasEmpenhoCount: number;
  comprasValorEmpenhado: number;
  portalEmpenhoCount: number;
  portalValorEmpenhado: number;
  diferencaValor: number;
}

export function flattenArpComparison(deps: {
  numeroControlePncpAta: string;
  syncRepo: SqliteSyncRepository;
  portalRepo: SqlitePortalDataRepository;
}): ArpComparisonBundle | null {
  const stored = deps.syncRepo.findArp(deps.numeroControlePncpAta);
  if (!stored) return null;

  const items = deps.syncRepo
    .findItemsByArp(deps.numeroControlePncpAta)
    .map((r) => r.raw);

  const empenhosCompras = deps.syncRepo.findEmpenhosByArp(
    deps.numeroControlePncpAta,
  );
  const empenhosPortal = deps.portalRepo.listEmpenhosByArp(
    deps.numeroControlePncpAta,
  );
  const contratos = deps.portalRepo.listContratosByArp(
    deps.numeroControlePncpAta,
  );
  const pessoasRows = deps.syncRepo.findPessoasJuridicasByArp(
    deps.numeroControlePncpAta,
  );
  const pessoasJuridicasByCnpj: Record<string, unknown> = {};
  for (const row of pessoasRows) {
    pessoasJuridicasByCnpj[row.cnpj] = row.raw;
  }

  const sancoesByCnpj: Record<string, PortalSancaoRow[]> = {};
  for (const row of pessoasRows) {
    sancoesByCnpj[row.cnpj] = deps.portalRepo.listSancoesByCnpj(row.cnpj);
  }

  const comparison = buildComparisonRows(items, empenhosCompras, empenhosPortal);

  return {
    arp: stored.raw,
    items,
    pessoasJuridicasByCnpj,
    empenhosCompras,
    empenhosPortal,
    contratos,
    sancoesByCnpj,
    comparison,
    generatedAt: new Date().toISOString(),
  };
}

export interface UasgComparisonBundle {
  codigoUasg: string;
  nomeUasg: string | null;
  arpBundles: ArpComparisonBundle[];
  totals: {
    arps: number;
    items: number;
    empenhosCompras: number;
    empenhosPortal: number;
    contratos: number;
    valorTotalArps: number;
    valorEmpenhadoCompras: number;
    valorEmpenhadoPortal: number;
  };
  generatedAt: string;
}

export function flattenUasgComparison(deps: {
  codigoUasg: string;
  syncRepo: SqliteSyncRepository;
  portalRepo: SqlitePortalDataRepository;
}): UasgComparisonBundle | null {
  const normalized = normalizeUasg(deps.codigoUasg);
  const arps = deps.syncRepo.findArpsByUasg(normalized);
  if (arps.length === 0) {
    return {
      codigoUasg: normalized,
      nomeUasg: null,
      arpBundles: [],
      totals: {
        arps: 0,
        items: 0,
        empenhosCompras: 0,
        empenhosPortal: 0,
        contratos: 0,
        valorTotalArps: 0,
        valorEmpenhadoCompras: 0,
        valorEmpenhadoPortal: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const arpBundles: ArpComparisonBundle[] = [];
  for (const stored of arps) {
    const bundle = flattenArpComparison({
      numeroControlePncpAta: stored.raw.numeroControlePncpAta,
      syncRepo: deps.syncRepo,
      portalRepo: deps.portalRepo,
    });
    if (bundle) arpBundles.push(bundle);
  }

  const totals = {
    arps: arpBundles.length,
    items: 0,
    empenhosCompras: 0,
    empenhosPortal: 0,
    contratos: 0,
    valorTotalArps: 0,
    valorEmpenhadoCompras: 0,
    valorEmpenhadoPortal: 0,
  };
  for (const b of arpBundles) {
    totals.items += b.items.length;
    totals.empenhosCompras += b.empenhosCompras.length;
    totals.empenhosPortal += b.empenhosPortal.length;
    totals.contratos += b.contratos.length;
    totals.valorTotalArps += b.arp.valorTotal ?? 0;
    for (const row of b.comparison) {
      totals.valorEmpenhadoCompras += row.comprasValorEmpenhado;
      totals.valorEmpenhadoPortal += row.portalValorEmpenhado;
    }
  }

  return {
    codigoUasg: normalized,
    nomeUasg: arpBundles[0]?.arp.nomeUnidadeGerenciadora ?? null,
    arpBundles,
    totals,
    generatedAt: new Date().toISOString(),
  };
}

function buildComparisonRows(
  items: ArpItem[],
  empenhosCompras: { numeroItem: string; raw: unknown }[],
  empenhosPortal: PortalEmpenhoRow[],
): ComparisonRow[] {
  // Group Compras empenhos by numeroItem and sum valorEmpenhado.
  const comprasByItem = new Map<string, { count: number; total: number }>();
  for (const row of empenhosCompras) {
    const valor = readNumber(row.raw, [
      "valorEmpenhado",
      "valor",
      "valorEmpenho",
    ]);
    const slot = comprasByItem.get(row.numeroItem) ?? { count: 0, total: 0 };
    slot.count += 1;
    slot.total += valor ?? 0;
    comprasByItem.set(row.numeroItem, slot);
  }

  // Group Portal empenhos by supplier CNPJ. We don't always have numeroItem
  // on the portal side, so rely on niFornecedor → portal CNPJ.
  const portalByCnpj = new Map<string, { count: number; total: number }>();
  for (const row of empenhosPortal) {
    const valor = readNumber(row.raw, [
      "valor",
      "valorEmpenho",
      "valorDocumento",
    ]);
    const slot = portalByCnpj.get(row.cnpj) ?? { count: 0, total: 0 };
    slot.count += 1;
    slot.total += valor ?? 0;
    portalByCnpj.set(row.cnpj, slot);
  }

  return items.map((item) => {
    const compras = comprasByItem.get(item.numeroItem) ?? {
      count: 0,
      total: 0,
    };
    const portal =
      (item.niFornecedor ? portalByCnpj.get(item.niFornecedor) : undefined) ?? {
        count: 0,
        total: 0,
      };
    return {
      numeroItem: item.numeroItem,
      niFornecedor: item.niFornecedor ?? null,
      nomeRazaoSocialFornecedor: item.nomeRazaoSocialFornecedor ?? null,
      descricaoItem: item.descricaoItem ?? null,
      quantidadeHomologadaVencedor:
        item.quantidadeHomologadaVencedor ?? null,
      valorTotalHomologado: item.valorTotal ?? null,
      comprasEmpenhoCount: compras.count,
      comprasValorEmpenhado: compras.total,
      portalEmpenhoCount: portal.count,
      portalValorEmpenhado: portal.total,
      diferencaValor: compras.total - portal.total,
    };
  });
}

function readNumber(obj: unknown, keys: string[]): number | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/\./g, "").replace(",", ".");
      const parsed = Number.parseFloat(cleaned);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}
