import axios, { type AxiosInstance } from "axios";
import type { RetryOptions } from "../utils/retry.js";

export interface Logger {
  warn(obj: Record<string, unknown>, msg: string): void;
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
  numeroCompra?: string;
  anoCompra?: string;
  codigoModalidadeCompra?: string;
  dataAssinatura?: string;
  dataVigenciaInicial?: string;
  dataVigenciaFinal?: string;
  numeroItem: string;
  codigoItem?: number;
  descricaoItem: string;
  tipoItem?: string;
  quantidadeHomologadaItem?: number;
  classificacaoFornecedor?: string;
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  quantidadeHomologadaVencedor?: number;
  valorUnitario?: number;
  valorTotal?: number;
  maximoAdesao?: number;
  nomeUnidadeGerenciadora?: string;
  nomeModalidadeCompra?: string;
  idCompra?: string;
  numeroControlePncpCompra?: string;
  dataHoraInclusao?: string;
  dataHoraAtualizacao?: string;
  quantidadeEmpenhada?: number;
  percentualMaiorDesconto?: number;
  situacaoSicaf?: string;
  dataHoraExclusao?: string | null;
  itemExcluido?: boolean;
  numeroControlePncpAta?: string;
  codigoPdm?: number;
  nomePdm?: string;
}

export type ArpComItens = Arp & {
  itens: ArpItem[];
};

export interface ConsultarArpResponse {
  resultado: Arp[];
  totalPaginas?: number;
}

export interface ConsultarArpItemResponse {
  resultado: ArpItem[];
  totalPaginas?: number;
}

export interface Uasg {
  codigoUasg: string;
  nomeUasg: string;
  usoSisg: boolean;
  adesaoSiasg: boolean;
  siglaUf: string;
  codigoMunicipio: number;
  codigoMunicipioIbge: number;
  nomeMunicipioIbge: string;
  codigoUnidadePolo: number;
  nomeUnidadePolo: string;
  codigoUnidadeEspelho: number;
  nomeUnidadeEspelho: string;
  uasgCadastradora: boolean;
  cnpjCpfUasg: string;
  codigoOrgao: number;
  cnpjCpfOrgao: string;
  cnpjCpfOrgaoVinculado: string;
  cnpjCpfOrgaoSuperior: string;
  codigoSiorg: string;
  statusUasg: boolean;
  dataImplantacaoSidec: string;
  dataHoraMovimento: string;
}

export interface ConsultarUasgResponse {
  resultado: Uasg[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
}

export interface ComprasGovClient {
  consultarArpsPorUnidadeGerenciadora(
    codigoUnidadeGerenciadora: string,
  ): Promise<Arp[]>;
  consultarItensDaArp(
    numeroControlePncpAta: string,
    onPage?: (page: number, totalPages: number) => void,
  ): Promise<ArpItem[]>;
  consultarEmpenhosSaldoItem?(
    numeroAta: string,
    unidadeGerenciadora: string,
  ): Promise<unknown[]>;
}

export interface UasgClient {
  consultarUasg(codigoUasg: string): Promise<Uasg | null>;
}

export class ComprasGovApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

interface HttpComprasGovClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries?: number;
  retryDelayMs?: number;
  /** Minimum interval between requests in ms. Default 1100. */
  minRequestIntervalMs?: number;
  /** Floor used by the adaptive limiter when decaying after success streaks. */
  minIntervalFloorMs?: number;
  /** Ceiling for adaptive bumps after repeated 429s. */
  minIntervalCeilingMs?: number;
  /** Called whenever the adaptive interval changes; persist via callback. */
  onIntervalChange?: (ms: number) => void;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

class RateLimiter {
  private nextAllowedAt = 0;
  private currentIntervalMs: number;
  private successStreak = 0;

  constructor(
    initialIntervalMs: number,
    private readonly floorMs: number,
    private readonly ceilingMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly onChange?: (ms: number) => void,
  ) {
    this.currentIntervalMs = Math.min(
      Math.max(initialIntervalMs, floorMs),
      ceilingMs,
    );
  }

  get intervalMs(): number {
    return this.currentIntervalMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.nextAllowedAt - now);
    this.nextAllowedAt =
      Math.max(now, this.nextAllowedAt) + this.currentIntervalMs;
    if (wait > 0) await this.sleep(wait);
  }

  /** Pause the limiter so the next acquire() blocks for at least `ms`. */
  pauseFor(ms: number): void {
    const target = Date.now() + ms;
    if (target > this.nextAllowedAt) this.nextAllowedAt = target;
  }

  /** Called after a 429 — bump interval upward, reset success streak. */
  onThrottled(): void {
    this.successStreak = 0;
    const next = Math.min(
      this.ceilingMs,
      Math.round(this.currentIntervalMs * 1.25),
    );
    if (next !== this.currentIntervalMs) {
      this.currentIntervalMs = next;
      this.onChange?.(next);
    }
  }

  /** Called after a non-429 success — decay 25% toward floor every 10 wins. */
  onSuccess(): void {
    this.successStreak += 1;
    if (this.successStreak < 10) return;
    this.successStreak = 0;
    const next = Math.max(
      this.floorMs,
      Math.round(this.currentIntervalMs * 0.75),
    );
    if (next !== this.currentIntervalMs) {
      this.currentIntervalMs = next;
      this.onChange?.(next);
    }
  }
}

function parseRetryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
  const headerVal = error.response.headers?.["retry-after"];
  if (typeof headerVal === "string" && /^\d+$/.test(headerVal)) {
    return Number(headerVal) * 1000;
  }
  const bodyMsg =
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof (error.response.data as { message: unknown }).message === "string"
      ? ((error.response.data as { message: string }).message)
      : "";
  const m = bodyMsg.match(/(\d+)\s*second/i);
  if (m) return Number(m[1]) * 1000;
  return 1000;
}

/**
 * Detects upstream transient failures that masquerade as 4xx/5xx but really
 * mean "back off and retry": Hikari pool exhaustion, 502/503/504, JDBC
 * timeouts. Treated like a 429 — bump adaptive interval, retry indefinitely.
 */
function parseTransientBackoffMs(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const status = error.response?.status;
  if (status === 502 || status === 503 || status === 504) return 2000;
  const body = error.response?.data;
  const text =
    typeof body === "string"
      ? body
      : typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message ?? "")
        : "";
  if (
    /HikariPool|Connection is not available|JDBC Connection|connection.*timed out/i.test(
      text,
    )
  ) {
    return 2000;
  }
  return null;
}

interface DateWindow {
  min: string;
  max: string;
}

const CONSULTAR_ARP_ENDPOINT = "/modulo-arp/1.2_consultarARP_FimVigencia";
const CONSULTAR_ARP_ITEM_ENDPOINT = "/modulo-arp/2.1_consultarARPItem_Id";
const CONSULTAR_EMPENHOS_SALDO_ITEM_ENDPOINT =
  "/modulo-arp/4_consultarEmpenhosSaldoItem";
const CONSULTAR_UASG_ENDPOINT = "/modulo-uasg/1_consultarUasg";
const TAMANHO_PAGINA_MAXIMO = 100;
const QUANTIDADE_ANOS_VIGENCIA_FINAL = 2;

export class HttpComprasGovClient implements ComprasGovClient, UasgClient {
  private readonly http: AxiosInstance;
  private readonly retry: RetryOptions;
  private readonly limiter: RateLimiter;
  private readonly logger?: Logger;

  constructor(options: HttpComprasGovClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });
    const sleep =
      options.sleep ??
      ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.retry = {
      maxRetries: options.maxRetries ?? 0,
      delayMs: options.retryDelayMs ?? 500,
      sleep,
    };
    const initialInterval = options.minRequestIntervalMs ?? 1100;
    this.limiter = new RateLimiter(
      initialInterval,
      options.minIntervalFloorMs ?? initialInterval,
      options.minIntervalCeilingMs ?? 5000,
      sleep,
      options.onIntervalChange,
    );
    this.logger = options.logger;
    if (options.logger && this.http.interceptors?.response) {
      this.setupLogging(options.logger);
    }
  }

  /**
   * Execute an HTTP request through the global rate limiter, with 429-aware
   * retry: when compras.gov returns 429, parse the "Try again in N seconds"
   * hint (or Retry-After header), pause the limiter accordingly, and retry.
   */
  private async request<T>(fn: () => Promise<T>): Promise<T> {
    // 429s retry indefinitely while feeding the adaptive limiter — that's
    // how the worker finds the sweet spot. Other errors bubble up.
    let attempt = 0;
    // Cap the non-429 attempt count via maxRetries; 429s don't consume it.
    let nonThrottleAttempts = 0;
    const maxNonThrottle = this.retry.maxRetries + 1;
    for (;;) {
      attempt += 1;
      await this.limiter.acquire();
      try {
        const result = await fn();
        this.limiter.onSuccess();
        return result;
      } catch (error) {
        const retryAfter =
          parseRetryAfterMs(error) ?? parseTransientBackoffMs(error);
        if (retryAfter == null) {
          nonThrottleAttempts += 1;
          if (nonThrottleAttempts >= maxNonThrottle) throw error;
          continue;
        }
        this.limiter.pauseFor(retryAfter + 250);
        this.limiter.onThrottled();
        this.logger?.warn(
          {
            retryAfterMs: retryAfter,
            attempt,
            newIntervalMs: this.limiter.intervalMs,
          },
          "Compras.gov.br transient — bumping adaptive interval, retrying",
        );
      }
    }
  }

  private setupLogging(logger: Logger): void {
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error)) {
          logger.warn(
            {
              endpoint: error.config?.url,
              params: error.config?.params,
              fullUrl: error.request?._currentUrl ?? error.config?.url,
              status: error.response?.status,
              body: error.response?.data,
              code: error.code,
              errno: (error as { errno?: number }).errno,
              message: error.message,
            },
            "Compras.gov.br request failed",
          );
        }
        return Promise.reject(error);
      },
    );
  }

  async consultarArpsPorUnidadeGerenciadora(
    codigoUnidadeGerenciadora: string,
  ): Promise<Arp[]> {
    try {
      const arps: Arp[] = [];

      for (const window of this.buildFinalValidityYearWindows()) {
        arps.push(
          ...(await this.consultarArpsPorPeriodo(
            codigoUnidadeGerenciadora,
            window,
          )),
        );
      }

      return arps;
    } catch (error) {
      throw this.mapError("consultarARP", error);
    }
  }

  async consultarItensDaArp(
    numeroControlePncpAta: string,
    onPage?: (page: number, totalPages: number) => void,
  ): Promise<ArpItem[]> {
    try {
      const items: ArpItem[] = [];
      let pagina = 1;
      let totalPaginas = 1;

      do {
        const { data } = await this.request(() =>
          this.http.get<ConsultarArpItemResponse>(CONSULTAR_ARP_ITEM_ENDPOINT, {
            params: {
              numeroControlePncpAta,
              pagina,
              tamanhoPagina: TAMANHO_PAGINA_MAXIMO,
            },
          }),
        );

        items.push(...data.resultado);
        totalPaginas = data.totalPaginas ?? 1;
        onPage?.(pagina, totalPaginas);
        pagina += 1;
      } while (pagina <= totalPaginas);

      return items;
    } catch (error) {
      throw this.mapError("consultarARPItem_Id", error);
    }
  }

  async consultarEmpenhosSaldoItem(
    numeroAta: string,
    unidadeGerenciadora: string,
  ): Promise<unknown[]> {
    try {
      const { data } = await this.request(() =>
        this.http.get<{ resultado: unknown[] }>(
          CONSULTAR_EMPENHOS_SALDO_ITEM_ENDPOINT,
          {
            params: {
              pagina: 1,
              tamanhoPagina: TAMANHO_PAGINA_MAXIMO,
              numeroAta,
              unidadeGerenciadora,
            },
          },
        ),
      );
      return data.resultado;
    } catch (error) {
      throw this.mapError("consultarEmpenhosSaldoItem", error);
    }
  }

  async consultarUasg(codigoUasg: string): Promise<Uasg | null> {
    try {
      const { data } = await this.request(() =>
        this.http.get<ConsultarUasgResponse>(CONSULTAR_UASG_ENDPOINT, {
          params: { codigoUasg, statusUasg: true, pagina: 1 },
        }),
      );
      return data.resultado[0] ?? null;
    } catch (error) {
      throw this.mapError("consultarUasg", error);
    }
  }

  private async consultarArpsPorPeriodo(
    codigoUnidadeGerenciadora: string,
    window: DateWindow,
  ): Promise<Arp[]> {
    const arps: Arp[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const { data } = await this.request(() =>
        this.http.get<ConsultarArpResponse>(CONSULTAR_ARP_ENDPOINT, {
          params: {
            pagina,
            tamanhoPagina: TAMANHO_PAGINA_MAXIMO,
            codigoUnidadeGerenciadora,
            dataVigenciaFinalMin: window.min,
            dataVigenciaFinalMax: window.max,
          },
        }),
      );

      arps.push(...data.resultado);
      totalPaginas = data.totalPaginas ?? 1;
      pagina += 1;
    } while (pagina <= totalPaginas);

    return arps;
  }

  private buildFinalValidityYearWindows(
    referenceDate = new Date(),
  ): DateWindow[] {
    const currentYear = referenceDate.getUTCFullYear();

    return Array.from(
      { length: QUANTIDADE_ANOS_VIGENCIA_FINAL },
      (_, index) => {
        const year = currentYear + index;
        return {
          min: `${year}-01-01`,
          max: `${year}-12-31`,
        };
      },
    );
  }

  private mapError(endpoint: string, error: unknown): ComprasGovApiError {
    if (!axios.isAxiosError(error)) {
      return new ComprasGovApiError(
        `Unexpected error while requesting ${endpoint}`,
        502,
      );
    }

    const statusCode = error.response?.status ?? 502;
    const details = error.response?.data;

    return new ComprasGovApiError(
      `Compras.gov.br returned ${statusCode} on ${endpoint}`,
      statusCode,
      details,
    );
  }
}
