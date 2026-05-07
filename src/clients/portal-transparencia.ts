import axios, { type AxiosInstance } from "axios";
import { PortalRateLimiter } from "../utils/portal-rate-limiter.js";

export interface PessoaFisicaQuery {
  cpf?: string;
  nis?: string;
}

export interface PortalSancoes {
  ceis: unknown[];
  cnep: unknown[];
}

export interface PortalTransparenciaClient {
  getPessoaJuridica(cnpj: string): Promise<unknown>;
  getPessoaFisica(query: PessoaFisicaQuery): Promise<unknown>;
  getContratosByCnpj(cnpj: string): Promise<unknown[]>;
  getEmpenhosByCnpj(
    cnpj: string,
    ano: number,
    fase?: number,
  ): Promise<unknown[]>;
  getEmpenhosAcrossYears(
    cnpj: string,
    years: number[],
    fase?: number,
  ): Promise<unknown[]>;
  getEmpenhoDetails(documento: string): Promise<unknown>;
  getItensEmpenho(documento: string): Promise<unknown[]>;
  getItemHistorico(documento: string, sequencial: number): Promise<unknown[]>;
  getDocumentosRelacionados(
    documento: string,
    fase?: number,
  ): Promise<unknown[]>;
  getSancoesCnpj(cnpj: string): Promise<PortalSancoes>;
}

export class PortalApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

interface HttpPortalTransparenciaClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries?: number;
  rateLimitDayPerMin?: number;
  rateLimitNightPerMin?: number;
}

const PAGE_SIZE_EMPENHOS = 15;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export class HttpPortalTransparenciaClient implements PortalTransparenciaClient {
  private readonly http: AxiosInstance;
  private readonly maxRetries: number;
  private readonly limiter: PortalRateLimiter;

  constructor(options: HttpPortalTransparenciaClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "chave-api-dados": options.apiKey,
      },
    });
    this.maxRetries = options.maxRetries ?? 5;
    this.limiter = new PortalRateLimiter({
      dayPerMin: options.rateLimitDayPerMin ?? 360,
      nightPerMin: options.rateLimitNightPerMin ?? 700,
    });
  }

  async getPessoaJuridica(cnpj: string): Promise<unknown> {
    return this.request<unknown>("/api-de-dados/pessoa-juridica", {
      cnpj: onlyDigits(cnpj),
    });
  }

  async getPessoaFisica(query: PessoaFisicaQuery): Promise<unknown> {
    return this.request<unknown>("/api-de-dados/pessoa-fisica", { ...query });
  }

  async getContratosByCnpj(cnpj: string): Promise<unknown[]> {
    const cpfCnpj = onlyDigits(cnpj);
    const all: unknown[] = [];
    let pagina = 1;
    for (;;) {
      const page = await this.request<unknown[]>(
        "/api-de-dados/contratos/cpf-cnpj",
        { cpfCnpj, pagina },
      );
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      pagina += 1;
      // Defensive cap — Portal contracts list per CNPJ is bounded but guard
      // against a misbehaving endpoint that never returns an empty page.
      if (pagina > 1000) break;
    }
    return all;
  }

  async getEmpenhosByCnpj(
    cnpj: string,
    ano: number,
    fase = 1,
  ): Promise<unknown[]> {
    const codigoPessoa = onlyDigits(cnpj);
    const all: unknown[] = [];
    let pagina = 1;
    for (;;) {
      const page = await this.request<unknown[]>(
        "/api-de-dados/despesas/documentos-por-favorecido",
        { codigoPessoa, ano, fase, pagina },
      );
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE_SIZE_EMPENHOS) break;
      pagina += 1;
      if (pagina > 1000) break;
    }
    return all;
  }

  async getEmpenhosAcrossYears(
    cnpj: string,
    years: number[],
    fase = 1,
  ): Promise<unknown[]> {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const year of years) {
      const page = await this.getEmpenhosByCnpj(cnpj, year, fase);
      for (const emp of page) {
        const documento = readDocumento(emp);
        if (!documento || seen.has(documento)) continue;
        seen.add(documento);
        out.push(emp);
      }
    }
    return out;
  }

  async getEmpenhoDetails(documento: string): Promise<unknown> {
    return this.request<unknown>(
      `/api-de-dados/despesas/documentos/${encodeURIComponent(documento)}`,
    );
  }

  async getItensEmpenho(documento: string): Promise<unknown[]> {
    const data = await this.request<unknown[]>(
      "/api-de-dados/despesas/itens-de-empenho",
      { codigoDocumento: documento, pagina: 1 },
    );
    if (!Array.isArray(data)) return [];
    return [...data].sort(
      (a, b) => readSequencial(a) - readSequencial(b),
    );
  }

  async getItemHistorico(
    documento: string,
    sequencial: number,
  ): Promise<unknown[]> {
    const data = await this.request<unknown[]>(
      "/api-de-dados/despesas/itens-de-empenho/historico",
      { codigoDocumento: documento, sequencial, pagina: 1 },
    );
    return Array.isArray(data) ? data : [];
  }

  async getDocumentosRelacionados(
    documento: string,
    fase = 1,
  ): Promise<unknown[]> {
    const data = await this.request<unknown[]>(
      "/api-de-dados/despesas/documentos-relacionados",
      { codigoDocumento: documento, fase },
    );
    return Array.isArray(data) ? data : [];
  }

  async getSancoesCnpj(cnpj: string): Promise<PortalSancoes> {
    const codigoSancionado = onlyDigits(cnpj);
    const result: PortalSancoes = { ceis: [], cnep: [] };
    for (const source of ["ceis", "cnep"] as const) {
      try {
        const data = await this.request<unknown[]>(
          `/api-de-dados/${source}`,
          { codigoSancionado, pagina: 1 },
        );
        if (Array.isArray(data)) result[source] = data;
      } catch {
        // sanctions endpoints occasionally 500 on unsanctioned CNPJs;
        // treat empty as the answer rather than failing the whole supplier.
      }
    }
    return result;
  }

  private async request<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;
    while (attempt < this.maxRetries) {
      await this.limiter.acquire();
      try {
        const { data } = await this.http.get<T>(path, { params });
        return data;
      } catch (error) {
        lastError = error;
        if (!axios.isAxiosError(error)) {
          throw this.mapError(path, error);
        }
        const status = error.response?.status;
        if (status === 429) {
          const retryAfter = parseRetryAfterMs(
            error.response?.headers?.["retry-after"],
          );
          await sleep(Math.max(retryAfter, expBackoffMs(attempt)));
          attempt += 1;
          continue;
        }
        if (status !== undefined && status >= 500 && status < 600) {
          await sleep(expBackoffMs(attempt));
          attempt += 1;
          continue;
        }
        if (status === undefined) {
          // network / timeout
          await sleep(expBackoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw this.mapError(path, error);
      }
    }
    throw this.mapError(path, lastError);
  }

  private mapError(endpoint: string, error: unknown): PortalApiError {
    if (!axios.isAxiosError(error)) {
      return new PortalApiError(
        `Unexpected error while requesting ${endpoint}`,
        502,
      );
    }
    const statusCode = error.response?.status ?? 502;
    const details = error.response?.data;
    if (statusCode === 400 || statusCode === 401 || statusCode === 500) {
      return new PortalApiError(
        `Portal da Transparência returned ${statusCode} on ${endpoint}`,
        statusCode,
        details,
      );
    }
    return new PortalApiError(
      `Failed to request Portal da Transparência endpoint ${endpoint}`,
      502,
      details,
    );
  }
}

function readDocumento(empenho: unknown): string | null {
  if (typeof empenho !== "object" || empenho === null) return null;
  const v = (empenho as { documento?: unknown }).documento;
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function readSequencial(item: unknown): number {
  if (typeof item !== "object" || item === null) return 0;
  const raw = (item as { sequencial?: unknown }).sequencial;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseRetryAfterMs(header: unknown): number {
  if (typeof header !== "string") return 0;
  const seconds = Number.parseFloat(header);
  if (!Number.isNaN(seconds)) return Math.max(seconds * 1000, 0);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0);
  return 0;
}

function expBackoffMs(attempt: number): number {
  const base = Math.min(60_000, 2 ** attempt * 1000);
  return base + Math.random() * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
}
