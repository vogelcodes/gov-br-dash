import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createAuthRoutes } from "../../../src/routes/auth.js";
import { createUserUasgRoutes } from "../../../src/routes/user-uasgs.js";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteAuthRepository } from "../../../src/db/auth-repository.js";
import { SqliteUserUasgRepository } from "../../../src/db/user-uasg-repository.js";
import { SqliteSyncJobRepository } from "../../../src/db/sync-job-repository.js";
import { AuthService } from "../../../src/services/auth.js";
import { UserUasgService } from "../../../src/services/user-uasgs.js";
import { SyncQuotaService } from "../../../src/services/sync-quota.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Uasg } from "../../../src/clients/compras-gov.js";

describe("auth and user UASG routes", () => {
  const uasgFixture: Uasg = {
    codigoUasg: "160292",
    nomeUasg: "COLEGIO MILITAR DO RIO DE JANEIRO",
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
  };

  async function buildApp() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-dash-auth-users-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    const authRepository = new SqliteAuthRepository(db);
    const userUasgRepository = new SqliteUserUasgRepository(db);
    const authService = new AuthService(authRepository, { sessionTtlMs: 7 * 24 * 60 * 60 * 1000 });
    const uasgLookup = { consultarUasg: vi.fn().mockResolvedValue(uasgFixture) };
    const userUasgs = new UserUasgService(userUasgRepository, uasgLookup);
    const jobRepository = new SqliteSyncJobRepository(db);
    const quotaService = new SyncQuotaService(jobRepository, 10);
    const app = Fastify();
    await app.register(cookie, { secret: "test-secret-with-at-least-32-chars" });
    await app.register(createAuthRoutes({ authService, secureCookies: false }));
    await app.register(createUserUasgRoutes({ authService, userUasgService: userUasgs, jobRepository, quotaService }));
    return {
      app,
      db,
      uasgLookup,
      async close() {
        await app.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("signs up, creates a session cookie, and returns the authenticated user", async () => {
    const { app, close } = await buildApp();

    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "User@Example.com", password: "correct horse battery staple" },
    });

    expect(signup.statusCode).toBe(201);
    expect(signup.json()).toMatchObject({ user: { email: "user@example.com", emailVerified: false } });
    const cookieHeader = signup.cookies.find((c) => c.name === "session")?.value;
    expect(cookieHeader).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session: cookieHeader ?? "" },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { email: "user@example.com" } });
    await close();
  });

  it("limits each user to three linked UASGs", async () => {
    const { app, close, uasgLookup } = await buildApp();
    uasgLookup.consultarUasg.mockImplementation(async (codigoUasg: string) => ({ ...uasgFixture, codigoUasg }));

    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "user@example.com", password: "correct horse battery staple" },
    });
    const session = signup.cookies.find((c) => c.name === "session")?.value ?? "";

    for (const codigoUasg of ["111111", "222222", "333333"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/me/uasgs",
        cookies: { session },
        payload: { codigoUasg },
      });
      expect(response.statusCode).toBe(201);
    }

    const fourth = await app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session },
      payload: { codigoUasg: "444444" },
    });

    expect(fourth.statusCode).toBe(409);
    expect(fourth.json()).toMatchObject({ message: "Each user can link at most 3 UASGs" });

    const list = await app.inject({ method: "GET", url: "/api/me/uasgs", cookies: { session } });
    expect(list.statusCode).toBe(200);
    expect(list.json().uasgs).toHaveLength(3);
    await close();
  });
});
