import type { CacheStore } from "../cache/store.js";
import type { Arp, ComprasGovClient } from "../clients/compras-gov.js";

export interface ArpsService {
  consultarArpsPorUasg(codigoUasg: string): Promise<Arp[]>;
}

interface CachedArpsServiceOptions {
  cacheTtlSeconds?: number;
}

export class CachedArpsService implements ArpsService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly client: ComprasGovClient,
    private readonly cache: CacheStore<unknown>,
    options: CachedArpsServiceOptions = {},
  ) {
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 300;
  }

  async consultarArpsPorUasg(codigoUasg: string): Promise<Arp[]> {
    const normalizedCodigoUasg = codigoUasg.replace(/\D/g, "");

    if (normalizedCodigoUasg.length !== 6) {
      throw new Error("UASG must contain 6 digits");
    }

    const key = `compras-gov:arps:v3:uasg:${normalizedCodigoUasg}`;

    return this.cache.getOrSet(
      key,
      () => this.client.consultarArpsPorUnidadeGerenciadora(normalizedCodigoUasg),
      this.cacheTtlSeconds,
    ) as Promise<Arp[]>;
  }
}
