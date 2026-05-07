import { api } from "./client";
import type { ArpItem, ArpSummary, Empenho, PessoaJuridica } from "./types";

export const arpsApi = {
  summary: (codigoUasg: string) =>
    api<{ arps: ArpSummary[] }>(
      "GET",
      `/api/me/uasgs/${encodeURIComponent(codigoUasg)}/arps/summary`,
    ),
  items: (ata: string) =>
    api<{ items: ArpItem[] }>(
      "GET",
      `/api/me/arps/${encodeURIComponent(ata)}/items`,
    ),
  empenhos: (ata: string) =>
    api<{
      empenhosByItem: Record<string, Empenho[]>;
      pessoasJuridicasByCnpj: Record<string, PessoaJuridica>;
    }>("GET", `/api/me/arps/${encodeURIComponent(ata)}/empenhos`),
  refreshArp: (ata: string) =>
    api<{ result: unknown }>(
      "POST",
      `/api/me/arps/${encodeURIComponent(ata)}/refresh`,
    ),
  refreshItem: (ata: string, numeroItem: string) =>
    api<{ result: unknown }>(
      "POST",
      `/api/me/arps/${encodeURIComponent(ata)}/items/${encodeURIComponent(numeroItem)}/refresh`,
    ),
  exportArpUrl: (ata: string, format: "csv" | "xlsx") =>
    `/api/me/arps/${encodeURIComponent(ata)}/export.${format}`,
  exportUasgUrl: (codigoUasg: string, format: "csv" | "xlsx") =>
    `/api/me/uasgs/${encodeURIComponent(codigoUasg)}/export.${format}`,
};
