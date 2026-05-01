import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteAuthRepository } from "../../../src/db/auth-repository.js";
import { SqliteUserUasgRepository } from "../../../src/db/user-uasg-repository.js";
import { SqliteSyncRepository } from "../../../src/db/sync-repository.js";
import { AuthService } from "../../../src/services/auth.js";
import { UserUasgService } from "../../../src/services/user-uasgs.js";
import { UserDataSyncService } from "../../../src/services/user-data-sync.js";
import { createAuthRoutes } from "../../../src/routes/auth.js";
import { createUserUasgRoutes } from "../../../src/routes/user-uasgs.js";
import { createUserSyncRoutes } from "../../../src/routes/user-sync.js";
import type { Arp, ArpItem, ComprasGovClient, UasgClient, Uasg } from "../../../src/clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../../../src/clients/portal-transparencia.js";

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

const arpFixture: Arp = {
  numeroAtaRegistroPreco: "1",
  codigoUnidadeGerenciadora: "160292",
  nomeUnidadeGerenciadora: "UG",
  codigoOrgao: 1,
  nomeOrgao: "ORGAO",
  linkAtaPNCP: "",
  linkCompraPNCP: "",
  numeroCompra: "10",
  anoCompra: "2024",
  codigoModalidadeCompra: "5",
  nomeModalidadeCompra: "Pregao",
  dataAssinatura: "2024-01-01",
  dataVigenciaInicial: "2024-01-01",
  dataVigenciaFinal: "2024-12-31",
  valorTotal: 10,
  statusAta: "Vigente",
  objeto: "Teste",
  quantidadeItens: 1,
  dataHoraAtualizacao: "2024-01-01T00:00:00",
  dataHoraInclusao: "2024-01-01T00:00:00",
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpAta: "ATA-1",
  numeroControlePncpCompra: "COMPRA-1",
  idCompra: "ID-1",
};

const itemFixture: ArpItem = {
  numeroControlePncpAta: "ATA-1",
  numeroItem: "1",
  descricaoItem: "Item",
};

describe("user-sync routes", () => {
  function buildApp() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-sync-routes-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    const authRepository = new SqliteAuthRepository(db);
    const userUasgRepository = new SqliteUserUasgRepository(db);
    const syncRepository = new SqliteSyncRepository(db);
    const authService = new AuthService(authRepository, { sessionTtlMs: 60 * 60 * 1000 });
    const uasgClient: UasgClient = {
      consultarUasg: vi.fn(async (codigoUasg: string) => uasgFixture(codigoUasg)),
    };
    const userUasgService = new UserUasgService(userUasgRepository, uasgClient);
    const comprasClient: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([]),
      consultarItensDaArp: vi.fn().mockResolvedValue([]),
    };
    const portalClient: PortalTransparenciaClient = {
      getPessoaFisica: vi.fn(),
      getPessoaJuridica: vi.fn(),
    };
    const syncService = new UserDataSyncService(syncRepository, comprasClient, portalClient);

    const app = Fastify();

    return {
      app,
      syncRepository,
      async ready() {
        await app.register(cookie, { secret: "test-cookie-secret-with-enough-entropy" });
        await app.register(createAuthRoutes({ authService, secureCookies: false }));
        await app.register(createUserUasgRoutes({ authService, userUasgService, syncService }));
        await app.register(createUserSyncRoutes({ authService, userUasgService, syncService }));
      },
      async close() {
        await app.close();
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  async function signupAndLink(app: ReturnType<typeof buildApp>): Promise<string> {
    const signup = await app.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "owner@example.com", password: "correct horse battery" },
    });
    const session = signup.cookies[0].value;
    await app.app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session },
      payload: { codigoUasg: "160292" },
    });
    return session;
  }

  describe("GET /api/me/uasgs/:codigoUasg/arps", () => {
    it("requires authentication", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const r = await ctx.app.inject({ method: "GET", url: "/api/me/uasgs/160292/arps" });
      expect(r.statusCode).toBe(401);
      await ctx.close();
    });

    it("returns 403 when UASG is not linked to the user", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const signup = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "stranger@example.com", password: "correct horse battery" },
      });
      const session = signup.cookies[0].value;
      const r = await ctx.app.inject({
        method: "GET",
        url: "/api/me/uasgs/160292/arps",
        cookies: { session },
      });
      expect(r.statusCode).toBe(403);
      await ctx.close();
    });

    it("returns ARPs persisted in DB for the linked UASG", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const session = await signupAndLink(ctx);

      ctx.syncRepository.upsertArp("160292", arpFixture);

      const r = await ctx.app.inject({
        method: "GET",
        url: "/api/me/uasgs/160292/arps",
        cookies: { session },
      });

      expect(r.statusCode).toBe(200);
      expect(r.json().arps).toHaveLength(1);
      expect(r.json().arps[0].numeroControlePncpAta).toBe("ATA-1");
      await ctx.close();
    });

    it("returns empty array when no ARPs in DB yet", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const session = await signupAndLink(ctx);

      const r = await ctx.app.inject({
        method: "GET",
        url: "/api/me/uasgs/160292/arps",
        cookies: { session },
      });

      expect(r.statusCode).toBe(200);
      expect(r.json().arps).toEqual([]);
      await ctx.close();
    });
  });

  describe("GET /api/me/arps/:numeroControlePncpAta/items", () => {
    it("requires authentication", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const r = await ctx.app.inject({ method: "GET", url: "/api/me/arps/ATA-1/items" });
      expect(r.statusCode).toBe(401);
      await ctx.close();
    });

    it("returns 404 when ARP is not owned by the user", async () => {
      const ctx = buildApp();
      await ctx.ready();
      // Owner links a UASG and gets an ARP under it
      await signupAndLink(ctx);
      ctx.syncRepository.upsertArp("160292", arpFixture);

      // A different user has no link to that UASG → does not own the ARP
      const stranger = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { email: "outsider@example.com", password: "correct horse battery" },
      });
      const session = stranger.cookies[0].value;

      const r = await ctx.app.inject({
        method: "GET",
        url: "/api/me/arps/ATA-1/items",
        cookies: { session },
      });

      expect(r.statusCode).toBe(404);
      await ctx.close();
    });

    it("returns items persisted in DB for an owned ARP", async () => {
      const ctx = buildApp();
      await ctx.ready();
      const session = await signupAndLink(ctx);

      ctx.syncRepository.upsertArp("160292", arpFixture);
      ctx.syncRepository.upsertArpItem("ATA-1", itemFixture);

      const r = await ctx.app.inject({
        method: "GET",
        url: "/api/me/arps/ATA-1/items",
        cookies: { session },
      });

      expect(r.statusCode).toBe(200);
      expect(r.json().items).toHaveLength(1);
      expect(r.json().items[0].numeroItem).toBe("1");
      await ctx.close();
    });
  });
});
