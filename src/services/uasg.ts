import type { CacheStore } from "../cache/store.js";
import type { Uasg, UasgClient } from "../clients/compras-gov.js";

export interface UasgService {
  consultarUasg(codigoUasg: string): Promise<Uasg | null>;
}

interface CachedUasgServiceOptions {
  cacheTtlSeconds?: number;
}

export class CachedUasgService implements UasgService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly client: UasgClient,
    private readonly cache: CacheStore<unknown>,
    options: CachedUasgServiceOptions = {},
  ) {
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 86400;
  }

  async consultarUasg(codigoUasg: string): Promise<Uasg | null> {
    const normalized = codigoUasg.replace(/\D/g, "");

    if (normalized.length !== 6) {
      throw new Error("UASG must contain 6 digits");
    }

    const key = `compras-gov:uasg:v1:codigo:${normalized}`;

    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      return cached as Uasg;
    }

    const result = await this.client.consultarUasg(normalized);
    if (result !== null) {
      await this.cache.set(key, result, this.cacheTtlSeconds);
    }
    return result;
  }
}
