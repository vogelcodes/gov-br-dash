import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Arp, ArpItem } from "../../../src/clients/compras-gov.js";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteSyncRepository } from "../../../src/db/sync-repository.js";

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

const arp = (overrides: Partial<Arp> = {}): Arp => ({ ...baseArp, ...overrides });
const item = (overrides: Partial<ArpItem> = {}): ArpItem => ({
  numeroControlePncpAta: "ATA-1",
  numeroItem: "1",
  descricaoItem: "Item",
  ...overrides,
});

function build(uasgs: string[] = ["160292", "999999"]) {
  const dir = mkdtempSync(join(tmpdir(), "gov-br-repo-"));
  const db = createDatabase(join(dir, "t.sqlite"));
  initializeSchema(db);
  const insertUasg = db.prepare(
    "INSERT INTO uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) VALUES (?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  for (const code of uasgs) {
    insertUasg.run(code, `UASG ${code}`, "{}", now);
  }
  const repo = new SqliteSyncRepository(db);
  return {
    repo,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("SqliteSyncRepository.findArpsByUasg", () => {
  it("returns only ARPs linked to the given UASG", () => {
    const ctx = build();
    ctx.repo.upsertArp("160292", arp({ numeroControlePncpAta: "ATA-A" }));
    ctx.repo.upsertArp("160292", arp({ numeroControlePncpAta: "ATA-B" }));
    ctx.repo.upsertArp("999999", arp({ numeroControlePncpAta: "ATA-C" }));

    const result = ctx.repo.findArpsByUasg("160292");

    expect(result.map((r) => r.raw.numeroControlePncpAta).sort()).toEqual(["ATA-A", "ATA-B"]);
    expect(result.every((r) => r.codigoUasg === "160292")).toBe(true);
    ctx.cleanup();
  });

  it("returns empty array when no ARPs exist for UASG", () => {
    const ctx = build();
    expect(ctx.repo.findArpsByUasg("160292")).toEqual([]);
    ctx.cleanup();
  });
});

describe("SqliteSyncRepository.findItemsByArp", () => {
  it("returns items ordered by numeric numeroItem", () => {
    const ctx = build();
    ctx.repo.upsertArp("160292", arp());
    ctx.repo.upsertArpItem("ATA-1", item({ numeroItem: "10" }));
    ctx.repo.upsertArpItem("ATA-1", item({ numeroItem: "2" }));
    ctx.repo.upsertArpItem("ATA-1", item({ numeroItem: "1" }));

    const result = ctx.repo.findItemsByArp("ATA-1");

    expect(result.map((r) => r.raw.numeroItem)).toEqual(["1", "2", "10"]);
    ctx.cleanup();
  });

  it("returns empty array when no items exist for ARP", () => {
    const ctx = build();
    expect(ctx.repo.findItemsByArp("ATA-1")).toEqual([]);
    ctx.cleanup();
  });
});

describe("SqliteSyncRepository.countItemsByArp", () => {
  it("returns the number of items linked to a given ARP", () => {
    const ctx = build();
    ctx.repo.upsertArp("160292", arp());
    ctx.repo.upsertArp("160292", arp({ numeroControlePncpAta: "ATA-2" }));
    ctx.repo.upsertArpItem("ATA-1", item({ numeroItem: "1" }));
    ctx.repo.upsertArpItem("ATA-1", item({ numeroItem: "2" }));
    ctx.repo.upsertArpItem("ATA-2", item({ numeroControlePncpAta: "ATA-2", numeroItem: "1" }));

    expect(ctx.repo.countItemsByArp("ATA-1")).toBe(2);
    expect(ctx.repo.countItemsByArp("ATA-2")).toBe(1);
    expect(ctx.repo.countItemsByArp("ATA-MISSING")).toBe(0);
    ctx.cleanup();
  });
});
