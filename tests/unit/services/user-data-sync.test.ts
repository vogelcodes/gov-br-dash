import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Arp, ArpItem, ComprasGovClient } from "../../../src/clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../../../src/clients/portal-transparencia.js";
import { createDatabase } from "../../../src/db/connection.js";
import { SqliteSyncRepository } from "../../../src/db/sync-repository.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { UserDataSyncService } from "../../../src/services/user-data-sync.js";

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
  numeroAtaRegistroPreco: "00021/2025",
  codigoUnidadeGerenciadora: "160292",
  numeroControlePncpAta: "ATA-1",
  numeroItem: "1",
  descricaoItem: "Item",
  niFornecedor: "11.111.111/0001-91",
};

describe("UserDataSyncService", () => {
  it("upserts ARPs, items and supplier CNPJs for a linked UASG", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-sync-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    db.prepare("INSERT INTO uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) VALUES (?, ?, ?, ?)").run(
      "160292",
      "UG",
      "{}",
      new Date().toISOString(),
    );
    const comprasClient: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arpFixture]),
      consultarItensDaArp: vi.fn().mockResolvedValue([itemFixture]),
      consultarEmpenhosSaldoItem: vi.fn().mockResolvedValue([{ id: "EMP-1", valor: 100 }]),
    };
    const portalClient: PortalTransparenciaClient = {
      getPessoaFisica: vi.fn(),
      getPessoaJuridica: vi.fn().mockResolvedValue({ cnpj: "11111111000191" }),
    };
    const repository = new SqliteSyncRepository(db);
    const service = new UserDataSyncService(repository, comprasClient, portalClient);

    const result = await service.syncUasg("160292");

    expect(result).toEqual({ arps: 1, items: 1, pessoasJuridicas: 1, empenhos: 1 });
    expect(comprasClient.consultarEmpenhosSaldoItem).toHaveBeenCalledWith("00021/2025", "160292");
    expect(repository.findArpForUasg("ATA-1", "160292")).not.toBeNull();
    expect(repository.findItem("ATA-1", "1")).not.toBeNull();
    expect(repository.findPessoaJuridica("11111111000191")).not.toBeNull();
    expect(repository.userOwnsPessoaJuridica("missing-user", "11111111000191")).toBe(false);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to ARP data when item does not include numeroAtaRegistroPreco/codigoUnidadeGerenciadora", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-sync-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    db.prepare("INSERT INTO uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) VALUES (?, ?, ?, ?)").run(
      "160292",
      "UG",
      "{}",
      new Date().toISOString(),
    );

    const itemWithoutAtaAndUasg: ArpItem = {
      numeroControlePncpAta: "ATA-1",
      numeroItem: "1",
      descricaoItem: "Item",
      niFornecedor: "11.111.111/0001-91",
    };

    const comprasClient: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arpFixture]),
      consultarItensDaArp: vi.fn().mockResolvedValue([itemWithoutAtaAndUasg]),
      consultarEmpenhosSaldoItem: vi.fn().mockResolvedValue([{ id: "EMP-1", valor: 100 }]),
    };
    const portalClient: PortalTransparenciaClient = {
      getPessoaFisica: vi.fn(),
      getPessoaJuridica: vi.fn().mockResolvedValue({ cnpj: "11111111000191" }),
    };
    const repository = new SqliteSyncRepository(db);
    const service = new UserDataSyncService(repository, comprasClient, portalClient);

    const result = await service.syncUasg("160292");

    expect(result.empenhos).toBe(1);
    expect(comprasClient.consultarEmpenhosSaldoItem).toHaveBeenCalledWith("1", "160292");

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
