import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../src/app.js";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteAuthRepository } from "../../../src/db/auth-repository.js";
import { SqliteUserUasgRepository } from "../../../src/db/user-uasg-repository.js";
import { SqliteSyncJobRepository } from "../../../src/db/sync-job-repository.js";
import { AuthService } from "../../../src/services/auth.js";
import { UserUasgService } from "../../../src/services/user-uasgs.js";
import { SyncQuotaService } from "../../../src/services/sync-quota.js";
import { createAuthRoutes } from "../../../src/routes/auth.js";
import { createUserUasgRoutes } from "../../../src/routes/user-uasgs.js";
import type { UasgClient, Uasg } from "../../../src/clients/compras-gov.js";

const uasgFixture = (codigoUasg: string): Uasg => ({
  codigoUasg,
  nomeUasg: `UASG ${codigoUasg}`,
  usoSisg: true,
  adesaoSiasg: true,
  siglaUf: "RJ",
  codigoMunicipio: 6001,
  codigoMunicipioIbge: 3304557,
  nomeMunicipioIbge: "Rio de Janeiro",
  codigoUnidadePolo: 0,
  nomeUnidadePolo: "",
  codigoUnidadeEspelho: 0,
  nomeUnidadeEspelho: "",
  uasgCadastradora: false,
  cnpjCpfUasg: "00394452000103",
  codigoOrgao: 52121,
  cnpjCpfOrgao: "00394452000103",
  cnpjCpfOrgaoVinculado: "",
  cnpjCpfOrgaoSuperior: "",
  codigoSiorg: "52121",
  statusUasg: true,
  dataImplantacaoSidec: "2000-01-01T00:00:00",
  dataHoraMovimento: "2024-01-15T10:30:00",
});

describe("UI static serving", () => {
  it("serves the real public/index.html at /", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-dash-ui-app-"));
    const app = await createApp({
      NODE_ENV: "test",
      PORT: 0,
      LOG_LEVEL: "error",
      GOVBR_API_BASE_URL:
        "https://api.portaldatransparencia.gov.br/api-de-dados",
      GOVBR_API_KEY: "test-key",
      GOVBR_API_TIMEOUT_MS: 5000,
      COMPRAS_GOV_API_BASE_URL: "https://dadosabertos.compras.gov.br",
      COMPRAS_GOV_API_TIMEOUT_MS: 5000,
      COMPRAS_GOV_MAX_RETRIES: 0,
      COMPRAS_GOV_RETRY_DELAY_MS: 1,
      COMPRAS_GOV_MIN_REQUEST_INTERVAL_MS: 0,
      CACHE_DEFAULT_TTL_SECONDS: 60,
      CACHE_STALE_TTL_SECONDS: 120,
      CACHE_MAX_ENTRIES: 100,
      UASG_CACHE_TTL_SECONDS: 60,
      RATE_LIMIT_MAX: 1000,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      CORS_ORIGIN: "*",
      COOKIE_SECRET: "test-cookie-secret-with-enough-entropy",
      SQLITE_DB_PATH: join(dir, "test.sqlite"),
      SYNC_JOBS_PER_MONTH: 10,
      SYNC_WORKER_POLL_MS: 60000,
    });

    try {
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body.toLowerCase()).toContain("<!doctype html>");
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function buildApp() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-dash-ui-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    const authRepository = new SqliteAuthRepository(db);
    const userUasgRepository = new SqliteUserUasgRepository(db);
    const authService = new AuthService(authRepository, {
      sessionTtlMs: 60 * 60 * 1000,
    });
    const uasgClient: UasgClient = {
      consultarUasg: vi.fn(async (codigoUasg: string) =>
        uasgFixture(codigoUasg),
      ),
    };
    const userUasgService = new UserUasgService(userUasgRepository, uasgClient);
    const jobRepository = new SqliteSyncJobRepository(db);
    const quotaService = new SyncQuotaService(jobRepository, 10);
    const app = Fastify();

    return {
      app,
      dir,
      async ready() {
        await app.register(cookie, {
          secret: "test-cookie-secret-with-enough-entropy",
        });
        await app.register(
          createAuthRoutes({ authService, secureCookies: false }),
        );
        await app.register(
          createUserUasgRoutes({
            authService,
            userUasgService,
            jobRepository,
            quotaService,
          }),
        );
      },
      async close() {
        await app.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("signup and login flows work via fetch against the API", async () => {
    const ctx = buildApp();
    await ctx.ready();

    // Signup
    const signup = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "user@test.com",
        password: "correct horse battery staple",
      },
    });
    expect(signup.statusCode).toBe(201);
    expect(signup.cookies.some((c) => c.name === "session")).toBe(true);

    // Login with same credentials
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "user@test.com",
        password: "correct horse battery staple",
      },
    });
    expect(login.statusCode).toBe(200);
    expect(login.cookies.some((c) => c.name === "session")).toBe(true);

    await ctx.close();
  });
});
