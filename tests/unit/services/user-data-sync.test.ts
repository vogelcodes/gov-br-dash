import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Arp, ArpItem, ComprasGovClient } from "../../../src/clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../../../src/clients/portal-transparencia.js";
import { createDatabase } from "../../../src/db/connection.js";
import { SqliteSyncRepository } from "../../../src/db/sync-repository.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { UserDataSyncService } from "../../../src/services/user-data-sync.js";

const baseArp: Arp = {
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

const arpFixture = (overrides: Partial<Arp> = {}): Arp => ({ ...baseArp, ...overrides });

const itemFixture = (overrides: Partial<ArpItem> = {}): ArpItem => ({
  numeroAtaRegistroPreco: "00021/2025",
  codigoUnidadeGerenciadora: "160292",
  numeroControlePncpAta: "ATA-1",
  numeroItem: "1",
  descricaoItem: "Item",
  niFornecedor: "11.111.111/0001-91",
  ...overrides,
});

interface BuiltService {
  service: UserDataSyncService;
  repository: SqliteSyncRepository;
  comprasClient: ComprasGovClient;
  portalClient: PortalTransparenciaClient;
  cleanup: () => void;
}

function buildService(comprasOverrides: Partial<ComprasGovClient> = {}): BuiltService {
  const dir = mkdtempSync(join(tmpdir(), "gov-br-sync-"));
  const db = createDatabase(join(dir, "test.sqlite"));
  initializeSchema(db);
  const insertUasg = db.prepare(
    "INSERT INTO uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) VALUES (?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  insertUasg.run("160292", "UG", "{}", now);
  insertUasg.run("999999", "UG2", "{}", now);

  const comprasClient: ComprasGovClient = {
    consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([]),
    consultarItensDaArp: vi.fn().mockResolvedValue([]),
    consultarEmpenhosSaldoItem: vi.fn().mockResolvedValue([]),
    ...comprasOverrides,
  };

  const portalClient: PortalTransparenciaClient = {
    getPessoaFisica: vi.fn(),
    getPessoaJuridica: vi.fn().mockResolvedValue({ cnpj: "11111111000191" }),
  };

  const repository = new SqliteSyncRepository(db);
  const service = new UserDataSyncService(repository, comprasClient, portalClient);

  return {
    service,
    repository,
    comprasClient,
    portalClient,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("UserDataSyncService.syncUasg", () => {
  it("persists all ARPs in phase 1 before fetching any items in phase 2", async () => {
    const arpA = arpFixture({ numeroControlePncpAta: "ATA-A", quantidadeItens: 1 });
    const arpB = arpFixture({ numeroControlePncpAta: "ATA-B", quantidadeItens: 1 });

    const callOrder: string[] = [];
    const ctx = buildService({
      consultarArpsPorUnidadeGerenciadora: vi.fn(async () => {
        callOrder.push("arps");
        return [arpA, arpB];
      }),
      consultarItensDaArp: vi.fn(async (pncp: string) => {
        callOrder.push(`items:${pncp}`);
        // When the items call for ATA-A fires, both ARPs must already be in the DB.
        expect(ctx.repository.findArpForUasg("ATA-A", "160292")).not.toBeNull();
        expect(ctx.repository.findArpForUasg("ATA-B", "160292")).not.toBeNull();
        return [itemFixture({ numeroControlePncpAta: pncp })];
      }),
    });

    const result = await ctx.service.syncUasg("160292");

    expect(callOrder).toEqual(["arps", "items:ATA-A", "items:ATA-B"]);
    expect(result.arps).toBe(2);
    expect(result.items).toBe(2);
    ctx.cleanup();
  });

  it("does not fetch empenhos or suppliers during auto-sync (delegated to refresh endpoints)", async () => {
    const ctx = buildService({
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arpFixture()]),
      consultarItensDaArp: vi.fn().mockResolvedValue([itemFixture()]),
    });

    const result = await ctx.service.syncUasg("160292");

    expect(result).toEqual({ arps: 1, items: 1, pessoasJuridicas: 0, empenhos: 0 });
    expect(ctx.comprasClient.consultarEmpenhosSaldoItem).not.toHaveBeenCalled();
    expect(ctx.portalClient.getPessoaJuridica).not.toHaveBeenCalled();
    ctx.cleanup();
  });

  it("skips items fetch for ARPs that already have all expected items in DB (resumable retry)", async () => {
    const arp = arpFixture({ quantidadeItens: 2 });
    const ctx = buildService({
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arp]),
      consultarItensDaArp: vi.fn().mockResolvedValue([
        itemFixture({ numeroItem: "1" }),
        itemFixture({ numeroItem: "2" }),
      ]),
    });

    await ctx.service.syncUasg("160292");
    expect(ctx.comprasClient.consultarItensDaArp).toHaveBeenCalledTimes(1);

    // Re-running sync: items already complete, should not re-fetch
    await ctx.service.syncUasg("160292");
    expect(ctx.comprasClient.consultarItensDaArp).toHaveBeenCalledTimes(1);
    ctx.cleanup();
  });

  it("re-fetches items when DB has fewer items than arp.quantidadeItens (partial sync)", async () => {
    const arp = arpFixture({ quantidadeItens: 2 });
    const ctx = buildService({
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arp]),
      consultarItensDaArp: vi.fn().mockResolvedValue([itemFixture({ numeroItem: "1" })]),
    });

    await ctx.service.syncUasg("160292");
    expect(ctx.repository.countItemsByArp("ATA-1")).toBe(1);

    // Second sync: DB has only 1 of 2 items expected → re-fetch
    await ctx.service.syncUasg("160292");
    expect(ctx.comprasClient.consultarItensDaArp).toHaveBeenCalledTimes(2);
    ctx.cleanup();
  });
});

describe("UserDataSyncService.syncItemsForArps", () => {
  it("upserts ARPs and persists items without fetching empenhos/suppliers", async () => {
    const arp = arpFixture();
    const ctx = buildService({
      consultarItensDaArp: vi.fn().mockResolvedValue([itemFixture()]),
    });

    await ctx.service.syncItemsForArps("160292", [arp]);

    expect(ctx.repository.findArpForUasg("ATA-1", "160292")).not.toBeNull();
    expect(ctx.repository.findItem("ATA-1", "1")).not.toBeNull();
    expect(ctx.comprasClient.consultarEmpenhosSaldoItem).not.toHaveBeenCalled();
    expect(ctx.portalClient.getPessoaJuridica).not.toHaveBeenCalled();
    ctx.cleanup();
  });
});

describe("UserDataSyncService read methods", () => {
  it("listArpsForUasg returns ARPs persisted under the given UASG", async () => {
    const ctx = buildService();
    ctx.repository.upsertArp("160292", arpFixture({ numeroControlePncpAta: "ATA-A" }));
    ctx.repository.upsertArp("160292", arpFixture({ numeroControlePncpAta: "ATA-B" }));
    ctx.repository.upsertArp("999999", arpFixture({ numeroControlePncpAta: "ATA-C" }));

    const arps = ctx.service.listArpsForUasg("160292");

    expect(arps.map((a) => a.numeroControlePncpAta).sort()).toEqual(["ATA-A", "ATA-B"]);
    ctx.cleanup();
  });

  it("listItemsForArp returns items persisted under the given ARP", async () => {
    const ctx = buildService();
    ctx.repository.upsertArp("160292", arpFixture());
    ctx.repository.upsertArpItem("ATA-1", itemFixture({ numeroItem: "1" }));
    ctx.repository.upsertArpItem("ATA-1", itemFixture({ numeroItem: "2" }));

    const items = ctx.service.listItemsForArp("ATA-1");

    expect(items.map((i) => i.numeroItem).sort()).toEqual(["1", "2"]);
    ctx.cleanup();
  });
});
