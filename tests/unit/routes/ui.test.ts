import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteAuthRepository } from "../../../src/db/auth-repository.js";
import { SqliteUserUasgRepository } from "../../../src/db/user-uasg-repository.js";
import { AuthService } from "../../../src/services/auth.js";
import { UserUasgService } from "../../../src/services/user-uasgs.js";
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
  function buildApp() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-dash-ui-"));
    const publicDir = join(dir, "public");
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(
      join(publicDir, "index.html"),
      "<!DOCTYPE html><html><head><title>gov-br-dash</title></head><body><h1>Hello</h1></body></html>"
    );
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
    const app = Fastify();

    return {
      app,
      dir,
      async ready() {
        await app.register(cookie, { secret: "test-cookie-secret-with-enough-entropy" });
        await app.register(fastifyStatic, { root: publicDir, prefix: "/" });
        await app.register(createAuthRoutes({ authService, secureCookies: false }));
        await app.register(createUserUasgRoutes({ authService, userUasgService }));
      },
      async close() {
        await app.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("serves index.html at /", async () => {
    const ctx = buildApp();
    await ctx.ready();

    const response = await ctx.app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<h1>Hello</h1>");

    await ctx.close();
  });

  it("signup and login flows work via fetch against the API", async () => {
    const ctx = buildApp();
    await ctx.ready();

    // Signup
    const signup = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "user@test.com", password: "correct horse battery staple" },
    });
    expect(signup.statusCode).toBe(201);
    expect(signup.cookies.some((c) => c.name === "session")).toBe(true);

    // Login with same credentials
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "user@test.com", password: "correct horse battery staple" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.cookies.some((c) => c.name === "session")).toBe(true);

    await ctx.close();
  });
});
