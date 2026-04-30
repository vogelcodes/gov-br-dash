import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Env } from "./config/index.js";
import { InMemoryCacheStore } from "./cache/in-memory.js";
import { HttpComprasGovClient } from "./clients/compras-gov.js";
import { HttpPortalTransparenciaClient } from "./clients/portal-transparencia.js";
import { createArpsRoute } from "./routes/arps.js";
import { createPessoasRoute } from "./routes/pessoas.js";
import { createUasgRoute } from "./routes/uasg.js";
import { CachedArpsService } from "./services/arps.js";
import { CachedPessoasService } from "./services/pessoas.js";
import { CachedUasgService } from "./services/uasg.js";
import { healthRoute } from "./routes/health.js";
import { versionRoute } from "./routes/version.js";

export async function createApp(env: Env) {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: `${env.RATE_LIMIT_WINDOW_SECONDS} seconds`,
  });

  const cache = new InMemoryCacheStore<unknown>({
    maxEntries: env.CACHE_MAX_ENTRIES,
    defaultTtlSeconds: env.CACHE_DEFAULT_TTL_SECONDS,
  });

  const portalClient = new HttpPortalTransparenciaClient({
    baseUrl: env.GOVBR_API_BASE_URL,
    apiKey: env.GOVBR_API_KEY,
    timeoutMs: env.GOVBR_API_TIMEOUT_MS,
  });

  const comprasGovClient = new HttpComprasGovClient({
    baseUrl: env.COMPRAS_GOV_API_BASE_URL,
    timeoutMs: env.COMPRAS_GOV_API_TIMEOUT_MS,
    maxRetries: env.COMPRAS_GOV_MAX_RETRIES,
    retryDelayMs: env.COMPRAS_GOV_RETRY_DELAY_MS,
    logger: fastify.log,
  });

  const pessoasService = new CachedPessoasService(portalClient, cache, {
    cacheTtlSeconds: env.CACHE_DEFAULT_TTL_SECONDS,
  });

  const arpsService = new CachedArpsService(comprasGovClient, cache, {
    cacheTtlSeconds: env.CACHE_DEFAULT_TTL_SECONDS,
  });

  const uasgService = new CachedUasgService(comprasGovClient, cache, {
    cacheTtlSeconds: env.UASG_CACHE_TTL_SECONDS,
  });

  await fastify.register(healthRoute);
  await fastify.register(versionRoute);
  await fastify.register(createPessoasRoute({ service: pessoasService }));
  await fastify.register(createArpsRoute({ service: arpsService }));
  await fastify.register(createUasgRoute({ service: uasgService }));

  return fastify;
}
