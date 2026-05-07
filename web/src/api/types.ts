// Mirrors backend types from src/clients/compras-gov.ts and
// src/services/user-data-sync.ts. Hand-maintained — keep in sync.

export interface PublicUser {
  id: string;
  email: string;
}

export interface UserUasg {
  codigoUasg: string;
  nomeUasg: string | null;
  linkedAt: string;
}

export interface Arp {
  numeroAtaRegistroPreco: string;
  codigoUnidadeGerenciadora: string;
  nomeUnidadeGerenciadora: string;
  codigoOrgao: number;
  nomeOrgao: string;
  linkAtaPNCP: string;
  linkCompraPNCP: string;
  numeroCompra: string;
  anoCompra: string;
  codigoModalidadeCompra: string;
  nomeModalidadeCompra: string;
  dataAssinatura: string;
  dataVigenciaInicial: string;
  dataVigenciaFinal: string;
  valorTotal: number;
  statusAta: string;
  objeto: string;
  quantidadeItens: number;
  dataHoraAtualizacao: string;
  dataHoraInclusao: string;
  dataHoraExclusao: string | null;
  ataExcluido: boolean;
  numeroControlePncpAta: string;
  numeroControlePncpCompra: string;
  idCompra: string;
}

export interface ArpItem {
  numeroAtaRegistroPreco?: string;
  codigoUnidadeGerenciadora?: string;
  numeroItem: string;
  descricaoItem: string;
  tipoItem?: string;
  quantidadeHomologadaItem?: number;
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  valorUnitario?: number;
  valorTotal?: number;
  maximoAdesao?: number;
  numeroControlePncpAta?: string;
  [key: string]: unknown;
}

export interface ArpSummary {
  arp: Arp;
  itemCount: number;
  expectedItems: number | null;
  empenhoCount: number;
  lastSyncedAt: string;
  lastItemsSyncedAt: string | null;
  lastEmpenhosSyncedAt: string | null;
}

export interface SyncProgress {
  inProgress: boolean;
  phase: "arps" | "items" | "empenhos" | null;
  totalArps: number;
  processedArps: number;
  failedArps: number;
  currentArp: string | null;
  currentArpItemPage: number | null;
  currentArpItemTotalPages: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

export type SyncJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type SyncJobPhase =
  | "arps"
  | "items"
  | "empenhos"
  | "portal-supplier"
  | null;

export interface SyncJob {
  id: string;
  userId: string;
  codigoUasg: string;
  status: SyncJobStatus;
  phase: SyncJobPhase;
  totalArps: number;
  processedArps: number;
  failedArps: number;
  currentArp: string | null;
  currentArpItemPage: number | null;
  currentArpItemTotalPages: number | null;
  lastError: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export interface Empenho {
  numeroItem?: string | number;
  quantidadeEmpenhada?: number;
  saldoEmpenho?: number;
  quantidadeRegistrada?: number;
  unidade?: string;
  codigoUasgEmpenho?: string;
  codigoUnidadeEmpenho?: string;
  codigoUasg?: string;
  unidadeEmpenho?: string;
  nomeUasgEmpenho?: string;
  tipoUasgEmpenho?: string;
  tipoOrgao?: string;
  tipo?: string;
  [key: string]: unknown;
}

export interface PessoaJuridica {
  cnpj?: string;
  nome?: string;
  razaoSocial?: string;
  [key: string]: unknown;
}
