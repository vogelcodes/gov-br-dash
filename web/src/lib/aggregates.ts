import type { ArpItem, Empenho } from "../api/types";
import { pct } from "./format";

export interface EmpenhoRow {
  unidade: string;
  tipo: "PARTICIPANTE" | "NÃO PARTICIPANTE" | "CARONA" | "OUTROS";
  registrada: number;
  empenhada: number;
  saldo: number;
}

export interface ItemAggregate {
  rows: EmpenhoRow[];
  totalReg: number;
  totalEmp: number;
  totalSaldo: number;
  valorEmp: number;
  valorSaldo: number;
  execPct: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function readEmp(e: Empenho): EmpenhoRow {
  const empenhada = num(e?.quantidadeEmpenhada ?? 0);
  const saldo = num(e?.saldoEmpenho ?? 0);
  const registradaRaw = e?.quantidadeRegistrada;
  const registrada =
    registradaRaw != null ? num(registradaRaw) : empenhada + saldo;
  const codigo =
    e?.codigoUasgEmpenho ??
    e?.codigoUnidadeEmpenho ??
    e?.codigoUasg ??
    e?.unidadeEmpenho ??
    "";
  const nome = e?.unidade ?? e?.nomeUasgEmpenho ?? "";
  const unidade =
    [codigo, nome].filter(Boolean).join(" — ") || "Unidade não identificada";
  const tipoRaw = String(
    e?.tipoUasgEmpenho ?? e?.tipoOrgao ?? e?.tipo ?? "",
  ).toUpperCase();
  let tipo: EmpenhoRow["tipo"] = "OUTROS";
  if (tipoRaw.includes("CARONA")) tipo = "CARONA";
  else if (tipoRaw.includes("NÃO") || tipoRaw.includes("NAO"))
    tipo = "NÃO PARTICIPANTE";
  else if (tipoRaw.includes("PARTICIPANTE") || tipoRaw === "P")
    tipo = "PARTICIPANTE";
  return { unidade, tipo, registrada, empenhada, saldo };
}

export function aggregateItem(
  item: ArpItem,
  empenhos: Empenho[] | undefined,
): ItemAggregate {
  const rows = (empenhos ?? []).map(readEmp);
  const totalReg = rows.reduce((s, r) => s + r.registrada, 0);
  const totalEmp = rows.reduce((s, r) => s + r.empenhada, 0);
  const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0);
  const valorUnit = num(item?.valorUnitario);
  return {
    rows,
    totalReg,
    totalEmp,
    totalSaldo,
    valorEmp: totalEmp * valorUnit,
    valorSaldo: totalSaldo * valorUnit,
    execPct: pct(totalEmp, totalReg),
  };
}

export interface AtaAggregate {
  totalReg: number;
  totalEmp: number;
  totalSaldo: number;
  valorEmp: number;
  valorSaldo: number;
  execPct: number;
}

export function aggregateAta(
  items: ArpItem[],
  empenhosByItem: Record<string, Empenho[]> | undefined,
): AtaAggregate {
  let totalReg = 0,
    totalEmp = 0,
    totalSaldo = 0,
    valorEmp = 0,
    valorSaldo = 0;
  for (const it of items ?? []) {
    const a = aggregateItem(it, empenhosByItem?.[it.numeroItem]);
    totalReg += a.totalReg;
    totalEmp += a.totalEmp;
    totalSaldo += a.totalSaldo;
    valorEmp += a.valorEmp;
    valorSaldo += a.valorSaldo;
  }
  return {
    totalReg,
    totalEmp,
    totalSaldo,
    valorEmp,
    valorSaldo,
    execPct: pct(totalEmp, totalReg),
  };
}
