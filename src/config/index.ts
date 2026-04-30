import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadEnvFile(): void {
  const envFilePath = resolve(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return;
  }

  const lines = readFileSync(envFilePath, "utf-8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GOVBR_API_BASE_URL: z
    .string()
    .url()
    .default("https://api.portaldatransparencia.gov.br"),
  GOVBR_API_KEY: z.string().min(1, "GOVBR_API_KEY is required"),
  GOVBR_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  COMPRAS_GOV_API_BASE_URL: z
    .string()
    .url()
    .default("https://dadosabertos.compras.gov.br"),
  COMPRAS_GOV_API_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  COMPRAS_GOV_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  COMPRAS_GOV_RETRY_DELAY_MS: z.coerce.number().int().positive().default(500),
  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  UASG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  CACHE_STALE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(10000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  CORS_ORIGIN: z.string().default("*"),
  REDIS_URL: z.string().url().optional(),
  SQLITE_DB_PATH: z.string().min(1).default("data/app.sqlite"),
  COOKIE_SECRET: z
    .string()
    .min(32, "COOKIE_SECRET must contain at least 32 characters")
    .default("development-cookie-secret-change-me-32"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const raw = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    GOVBR_API_BASE_URL: process.env.GOVBR_API_BASE_URL,
    GOVBR_API_KEY: process.env.GOVBR_API_KEY,
    GOVBR_API_TIMEOUT_MS: process.env.GOVBR_API_TIMEOUT_MS,
    COMPRAS_GOV_API_BASE_URL: process.env.COMPRAS_GOV_API_BASE_URL,
    COMPRAS_GOV_API_TIMEOUT_MS: process.env.COMPRAS_GOV_API_TIMEOUT_MS,
    COMPRAS_GOV_MAX_RETRIES: process.env.COMPRAS_GOV_MAX_RETRIES,
    COMPRAS_GOV_RETRY_DELAY_MS: process.env.COMPRAS_GOV_RETRY_DELAY_MS,
    CACHE_DEFAULT_TTL_SECONDS: process.env.CACHE_DEFAULT_TTL_SECONDS,
    UASG_CACHE_TTL_SECONDS: process.env.UASG_CACHE_TTL_SECONDS,
    CACHE_STALE_TTL_SECONDS: process.env.CACHE_STALE_TTL_SECONDS,
    CACHE_MAX_ENTRIES: process.env.CACHE_MAX_ENTRIES,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    REDIS_URL: process.env.REDIS_URL,
    SQLITE_DB_PATH: process.env.SQLITE_DB_PATH,
    COOKIE_SECRET: process.env.COOKIE_SECRET,
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${errors}`);
  }

  cachedEnv = result.data;

  return cachedEnv;
}
