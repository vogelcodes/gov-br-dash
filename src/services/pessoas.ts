import type { CacheStore } from "../cache/store.js";
import type {
  PessoaFisicaQuery,
  PortalTransparenciaClient,
} from "../clients/portal-transparencia.js";

export interface PessoasService {
  consultarPessoaJuridica(cnpj: string): Promise<unknown>;
  consultarPessoaFisica(params: PessoaFisicaQuery): Promise<unknown>;
}

interface CachedPessoasServiceOptions {
  cacheTtlSeconds?: number;
}

export class CachedPessoasService implements PessoasService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly client: PortalTransparenciaClient,
    private readonly cache: CacheStore<unknown>,
    options: CachedPessoasServiceOptions = {},
  ) {
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 300;
  }

  async consultarPessoaJuridica(cnpj: string): Promise<unknown> {
    const key = `portal:pessoa-juridica:v1:cnpj:${cnpj}`;
    return this.cache.getOrSet(
      key,
      () => this.client.getPessoaJuridica(cnpj),
      this.cacheTtlSeconds,
    );
  }

  async consultarPessoaFisica(params: PessoaFisicaQuery): Promise<unknown> {
    const { cpf, nis } = params;

    if (!cpf && !nis) {
      throw new Error("Either cpf or nis must be provided");
    }

    const discriminator = cpf ? `cpf:${cpf}` : `nis:${nis}`;
    const key = `portal:pessoa-fisica:v1:${discriminator}`;

    return this.cache.getOrSet(
      key,
      () => this.client.getPessoaFisica(params),
      this.cacheTtlSeconds,
    );
  }
}
