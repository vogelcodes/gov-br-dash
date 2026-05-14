import { api } from "./client";
import type { PessoaJuridica } from "./types";

export interface PortalEmpenhoRow {
  documento: string;
  cnpj: string;
  ano: number;
  fase: number;
  raw: Record<string, unknown>;
  lastSyncedAt: string;
}

export interface PortalContratoRow {
  contratoId: string;
  cnpj: string;
  raw: Record<string, unknown>;
  lastSyncedAt: string;
}

export interface PortalSancaoRow {
  cnpj: string;
  source: "ceis" | "cnep";
  idx: number;
  raw: Record<string, unknown>;
  lastSyncedAt: string;
}

export interface SupplierPortalSummary {
  pessoa: {
    raw: PessoaJuridica;
    lastSyncedAt: string;
    lastChangedAt: string | null;
  } | null;
  empenhos: PortalEmpenhoRow[];
  contratos: PortalContratoRow[];
  sancoes: PortalSancaoRow[];
}

export interface PortalEmpenhoBundle {
  documento: string;
  empenho: Record<string, unknown>;
  detail: Record<string, unknown> | null;
  itens: { sequencial: number; raw: Record<string, unknown> }[];
  historico: { sequencial: number; idx: number; raw: Record<string, unknown> }[];
  relacionados: { related: string; fase: number; raw: Record<string, unknown> }[];
}

export interface SupplierSyncResult {
  suppliers: number;
  failedSuppliers: number;
  contratos: number;
  empenhos: number;
}

export const suppliersApi = {
  portalSummary: (cnpj: string) =>
    api<SupplierPortalSummary>(
      "GET",
      `/api/me/suppliers/${encodeURIComponent(cnpj)}/portal-summary`,
    ),
  refreshPessoa: (cnpj: string) =>
    api<unknown>(
      "POST",
      `/api/me/pessoas-juridicas/${encodeURIComponent(cnpj)}/refresh`,
    ),
  syncPortal: (cnpj: string) =>
    api<{ result: SupplierSyncResult }>(
      "POST",
      `/api/me/suppliers/${encodeURIComponent(cnpj)}/portal-sync`,
    ),
  empenhoDetail: (documento: string) =>
    api<{ bundle: PortalEmpenhoBundle }>(
      "GET",
      `/api/me/empenhos/${encodeURIComponent(documento)}/portal-detail`,
    ),
};
