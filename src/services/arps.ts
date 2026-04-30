import type { CacheStore } from "../cache/store.js";
import type { ArpComItens, ComprasGovClient } from "../clients/compras-gov.js";

export interface ArpsService {
  consultarArpsPorUasg(codigoUasg: string): Promise<ArpComItens[]>;
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

  async consultarArpsPorUasg(codigoUasg: string): Promise<ArpComItens[]> {
    const normalizedCodigoUasg = codigoUasg.replace(/\D/g, "");

    if (normalizedCodigoUasg.length !== 6) {
      throw new Error("UASG must contain 6 digits");
    }

    const key = `compras-gov:arps:v2:uasg:${normalizedCodigoUasg}`;

    return this.cache.getOrSet(
      key,
      async () => {
        const arps =
          await this.client.consultarArpsPorUnidadeGerenciadora(
            normalizedCodigoUasg,
          );

        const arpsComItens: ArpComItens[] = [];

        for (const arp of arps) {
          arpsComItens.push({
            ...arp,
            itens: await this.client.consultarItensDaArp(
              arp.numeroControlePncpAta,
            ),
          });
        }

        return arpsComItens;
      },
      this.cacheTtlSeconds,
    ) as Promise<ArpComItens[]>;
  }
}
