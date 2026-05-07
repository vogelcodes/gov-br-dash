import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("auth and user UASG routes", () => {
  function buildApp() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-dash-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    const authRepository = new SqliteAuthRepository(db);
    const userUasgRepository = new SqliteUserUasgRepository(db);
    const authService = new AuthService(authRepository, {
      sessionTtlMs: 60 * 60 * 1000,
    });
    const uasgClient: UasgClient = {
      consultarUasg: vi.fn(async (codigoUasg: string) => uasgFixture(codigoUasg)),
    };
    const userUasgService = new UserUasgService(userUasgRepository, uasgClient);
    const jobRepository = new SqliteSyncJobRepository(db);
    const quotaService = new SyncQuotaService(jobRepository, 10);
    const app = Fastify();

    return {
      app,
      uasgClient,
      jobRepository,
      async ready() {
        await app.register(cookie, { secret: "test-cookie-secret-with-enough-entropy" });
        await app.register(createAuthRoutes({ authService, secureCookies: false }));
        await app.register(createUserUasgRoutes({ authService, userUasgService, jobRepository, quotaService }));
      },
      async close() {
        await app.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("signs up, stores an httpOnly signed cookie, and returns the authenticated user", async () => {
    const ctx = buildApp();
    await ctx.ready();

    const signup = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "USER@example.com", password: "correct horse battery" },
    });

    expect(signup.statusCode).toBe(201);
    expect(signup.cookies[0].name).toBe("session");
    expect(signup.cookies[0].httpOnly).toBe(true);
    expect(signup.json().user).toMatchObject({ email: "user@example.com" });

    const me = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session: signup.cookies[0].value },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: "user@example.com" });
    await ctx.close();
  });

  it("requires authentication and limits each user to three linked UASGs", async () => {
    const ctx = buildApp();
    await ctx.ready();

    const unauthenticated = await ctx.app.inject({ method: "GET", url: "/api/me/uasgs" });
    expect(unauthenticated.statusCode).toBe(401);

    const signup = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "owner@example.com", password: "correct horse battery" },
    });
    const session = signup.cookies[0].value;

    for (const codigoUasg of ["160292", "153163", "200001"]) {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/me/uasgs",
        cookies: { session },
        payload: { codigoUasg },
      });
      expect(response.statusCode).toBe(201);
    }

    const overLimit = await ctx.app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session },
      payload: { codigoUasg: "250001" },
    });

    expect(overLimit.statusCode).toBe(409);
    expect(ctx.uasgClient.consultarUasg).toHaveBeenCalledTimes(3);

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/me/uasgs",
      cookies: { session },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().uasgs).toHaveLength(3);

    await ctx.close();
  });

  it("enqueues a sync job when a UASG is added", async () => {
    const ctx = buildApp();
    await ctx.ready();

    const signup = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "syncer@example.com", password: "correct horse battery" },
    });
    const session = signup.cookies[0].value;

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session },
      payload: { codigoUasg: "160292" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { uasg: { codigoUasg: string }; job: { codigoUasg: string; status: string } | null };
    expect(body.job?.codigoUasg).toBe("160292");
    expect(body.job?.status).toBe("queued");

    await ctx.close();
  });
});
