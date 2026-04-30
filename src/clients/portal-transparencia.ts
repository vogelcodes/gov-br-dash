import axios, { type AxiosInstance } from "axios";

export interface PessoaFisicaQuery {
  cpf?: string;
  nis?: string;
}

export interface PortalTransparenciaClient {
  getPessoaJuridica(cnpj: string): Promise<unknown>;
  getPessoaFisica(query: PessoaFisicaQuery): Promise<unknown>;
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
}

export class HttpPortalTransparenciaClient implements PortalTransparenciaClient {
  private readonly http: AxiosInstance;

  constructor(options: HttpPortalTransparenciaClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: {
        "chave-api-dados": options.apiKey,
      },
    });
  }

  async getPessoaJuridica(cnpj: string): Promise<unknown> {
    try {
      const { data } = await this.http.get("/api-de-dados/pessoa-juridica", {
        params: { cnpj },
      });
      return data;
    } catch (error) {
      throw this.mapError("pessoa-juridica", error);
    }
  }

  async getPessoaFisica(query: PessoaFisicaQuery): Promise<unknown> {
    try {
      const { data } = await this.http.get("/api-de-dados/pessoa-fisica", {
        params: query,
      });
      return data;
    } catch (error) {
      throw this.mapError("pessoa-fisica", error);
    }
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
