import axios, { type AxiosInstance } from "axios";
import { withRetry, type RetryOptions } from "../utils/retry.js";

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
  consultarItensDaArp(numeroControlePncpAta: string): Promise<ArpItem[]>;
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
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

interface DateWindow {
  min: string;
  max: string;
}

const CONSULTAR_ARP_ENDPOINT = "/modulo-arp/1.2_consultarARP_FimVigencia";
const CONSULTAR_ARP_ITEM_ENDPOINT = "/modulo-arp/2.1_consultarARPItem_Id";
const CONSULTAR_EMPENHOS_SALDO_ITEM_ENDPOINT = "/modulo-arp/4_consultarEmpenhosSaldoItem";
const CONSULTAR_UASG_ENDPOINT = "/modulo-uasg/1_consultarUasg";
const TAMANHO_PAGINA_MAXIMO = 500;
const QUANTIDADE_ANOS_VIGENCIA_FINAL = 3;

export class HttpComprasGovClient implements ComprasGovClient, UasgClient {
  private readonly http: AxiosInstance;
  private readonly retry: RetryOptions;

  constructor(options: HttpComprasGovClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
    });
    this.retry = {
      maxRetries: options.maxRetries ?? 0,
      delayMs: options.retryDelayMs ?? 500,
      sleep: options.sleep,
    };
    if (options.logger) {
      this.setupLogging(options.logger);
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
              status: error.response?.status,
              body: error.response?.data,
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

  async consultarItensDaArp(numeroControlePncpAta: string): Promise<ArpItem[]> {
    try {
      const { data } = await withRetry(
        () =>
          this.http.get<ConsultarArpItemResponse>(CONSULTAR_ARP_ITEM_ENDPOINT, {
            params: { numeroControlePncpAta },
          }),
        this.retry,
      );
      return data.resultado;
    } catch (error) {
      throw this.mapError("consultarARPItem_Id", error);
    }
  }

  async consultarEmpenhosSaldoItem(
    numeroAta: string,
    unidadeGerenciadora: string,
  ): Promise<unknown[]> {
    try {
      const { data } = await withRetry(
        () =>
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
        this.retry,
      );
      return data.resultado;
    } catch (error) {
      throw this.mapError("consultarEmpenhosSaldoItem", error);
    }
  }

  async consultarUasg(codigoUasg: string): Promise<Uasg | null> {
    try {
      const { data } = await withRetry(
        () =>
          this.http.get<ConsultarUasgResponse>(CONSULTAR_UASG_ENDPOINT, {
            params: { codigoUasg, statusUasg: true, pagina: 1 },
          }),
        this.retry,
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
      const { data } = await withRetry(
        () =>
          this.http.get<ConsultarArpResponse>(CONSULTAR_ARP_ENDPOINT, {
            params: {
              pagina,
              tamanhoPagina: TAMANHO_PAGINA_MAXIMO,
              codigoUnidadeGerenciadora,
              dataVigenciaFinalMin: window.min,
              dataVigenciaFinalMax: window.max,
            },
          }),
        this.retry,
      );

      arps.push(...data.resultado);
      totalPaginas = data.totalPaginas ?? 1;
      pagina += 1;
    } while (pagina <= totalPaginas);

    return arps;
  }

  private buildFinalValidityYearWindows(referenceDate = new Date()): DateWindow[] {
    const currentYear = referenceDate.getUTCFullYear();

    return Array.from({ length: QUANTIDADE_ANOS_VIGENCIA_FINAL }, (_, index) => {
      const year = currentYear + index;
      return {
        min: `${year}-01-01`,
        max: `${year}-12-31`,
      };
    });
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
