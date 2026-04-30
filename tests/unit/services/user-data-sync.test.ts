import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase } from "../../../src/db/sqlite.js";
import {
  SqliteUserDataSyncRepository,
  UserDataSyncService,
} from "../../../src/services/user-data-sync.js";
import type { ArpsService } from "../../../src/services/arps.js";
import type { PessoasService } from "../../../src/services/pessoas.js";
import type { ArpComItens } from "../../../src/clients/compras-gov.js";

const arpComItensFixture: ArpComItens = {
  numeroAtaRegistroPreco: "90018/2025",
  numeroControlePncpAta: "00394452000103-1-018458/2025-000001",
  codigoUnidadeGerenciadora: "160292",
  nomeUnidadeGerenciadora: "COLEGIO MILITAR",
  codigoOrgao: 52121,
  nomeOrgao: "COMANDO DO EXERCITO",
  linkAtaPNCP: "https://pncp.gov.br/ata/abc",
  linkCompraPNCP: "https://pncp.gov.br/compra/abc",
  numeroCompra: "9/2025",
  anoCompra: "2025",
  codigoModalidadeCompra: "PREGAO",
  nomeModalidadeCompra: "Pregão Eletrônico",
  dataAssinatura: "2025-01-01",
  dataVigenciaInicial: "2025-01-01",
  dataVigenciaFinal: "2026-01-01",
  valorTotal: 100000,
  statusAta: "ATIVA",
  objeto: "Material de escritório",
  quantidadeItens: 1,
  dataHoraAtualizacao: "2025-01-01T00:00:00",
  dataHoraInclusao: "2025-01-01T00:00:00",
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpCompra: "00394452000103-1-018458/2025",
  idCompra: "123",
  itens: [
    {
      numeroItem: "1",
      descricaoItem: "Caneta esferográfica",
      niFornecedor: "12.345.678/0001-90",
      nomeRazaoSocialFornecedor: "FORNECEDOR EXEMPLO LTDA",
      quantidadeHomologadaVencedor: 1000,
      valorUnitario: 5,
      valorTotal: 5000,
    },
  ],
};

const arpWithCnpjFixture: ArpComItens = {
  ...arpComItensFixture,
  numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
  itens: [
    {
      ...arpComItensFixture.itens[0]!,
      numeroItem: "1",
      niFornecedor: "98.765.432/0001-88",
    },
  ],
};

const cnpjPjDataFixture = { nome: "FORNECEDOR EXEMPLO LTDA", matriz: true };

describe("SqliteUserDataSyncRepository", () => {
  let dir: string;
  let db: ReturnType<typeof createSqliteDatabase>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gov-br-dash-sync-"));
    db = createSqliteDatabase(join(dir, "app.sqlite"));
    // seed user and uasg so foreign keys pass
    db.prepare(
      "insert into users (id, email, password_hash, email_verified, created_at, updated_at) values (?, ?, ?, 0, ?, ?)",
    ).run("user-1", "user@test.com", "hash", "2026-04-30T00:00:00.000Z", "2026-04-30T00:00:00.000Z");
    db.prepare(
      "insert into uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) values (?, ?, ?, ?)",
    ).run("160292", "COLEGIO MILITAR", "{}", "2026-04-30T00:00:00.000Z");
    db.prepare(
      "insert into user_uasgs (user_id, codigo_uasg, linked_at) values (?, ?, ?)",
    ).run("user-1", "160292", "2026-04-30T00:00:00.000Z");
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("saves ARP with items to database", () => {
    const repo = new SqliteUserDataSyncRepository(db);
    repo.saveArpWithItems(arpComItensFixture, "160292", "2026-04-30T12:00:00.000Z");

    const arpRow = db.prepare(
      "select * from arps where numero_controle_pncp_ata = ?",
    ).get(arpComItensFixture.numeroControlePncpAta) as Record<string, unknown>;
    expect(arpRow.codigo_uasg).toBe("160292");
    expect(arpRow.raw_json).toContain("90018/2025");

    const itemRows = db.prepare(
      "select * from arp_items where numero_controle_pncp_ata = ?",
    ).all(arpComItensFixture.numeroControlePncpAta) as Record<string, unknown>[];
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0]!.numero_item).toBe("1");
  });

  it("upserts ARP and items on re-sync", () => {
    const repo = new SqliteUserDataSyncRepository(db);
    const syncedAt1 = "2026-04-30T12:00:00.000Z";
    const syncedAt2 = "2026-04-30T13:00:00.000Z";

    repo.saveArpWithItems(arpComItensFixture, "160292", syncedAt1);
    repo.saveArpWithItems(arpComItensFixture, "160292", syncedAt2);

    const rows = db.prepare(
      "select * from arps where numero_controle_pncp_ata = ?",
    ).all(arpComItensFixture.numeroControlePncpAta) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect((rows[0] as { last_synced_at: string }).last_synced_at).toBe(syncedAt2);
  });

  it("saves CNPJ data to database", () => {
    const repo = new SqliteUserDataSyncRepository(db);
    repo.saveCnpj("12345678000190", cnpjPjDataFixture, "2026-04-30T12:00:00.000Z");

    const row = db.prepare("select * from cnpjs where cnpj = ?").get("12345678000190") as Record<string, unknown>;
    expect(row.raw_json).toContain("FORNECEDOR");
    expect((row as { last_synced_at: string }).last_synced_at).toBe("2026-04-30T12:00:00.000Z");
  });

  it("upserts CNPJ on re-sync", () => {
    const repo = new SqliteUserDataSyncRepository(db);
    repo.saveCnpj("12345678000190", { nome: "OLD" }, "2026-04-30T12:00:00.000Z");
    repo.saveCnpj("12345678000190", { nome: "NEW" }, "2026-04-30T13:00:00.000Z");

    const rows = db.prepare("select * from cnpjs where cnpj = ?").all("12345678000190") as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect((rows[0] as { raw_json: string }).raw_json).toContain("NEW");
  });

  it("reports userHasUasg correctly", () => {
    const repo = new SqliteUserDataSyncRepository(db);
    expect(repo.userHasUasg("user-1", "160292")).toBe(true);
    expect(repo.userHasUasg("user-1", "999999")).toBe(false);
    expect(repo.userHasUasg("nonexistent-user", "160292")).toBe(false);
  });
});

describe("UserDataSyncService", () => {
  let dir: string;
  let db: ReturnType<typeof createSqliteDatabase>;
  let repository: SqliteUserDataSyncRepository;
  const arpsService: ArpsService = { consultarArpsPorUasg: vi.fn() };
  const pessoasService: PessoasService = {
    consultarPessoaJuridica: vi.fn(),
    consultarPessoaFisica: vi.fn(),
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gov-br-dash-sync-svc-"));
    db = createSqliteDatabase(join(dir, "app.sqlite"));
    db.prepare(
      "insert into users (id, email, password_hash, email_verified, created_at, updated_at) values (?, ?, ?, 0, ?, ?)",
    ).run("user-1", "user@test.com", "hash", "2026-04-30T00:00:00.000Z", "2026-04-30T00:00:00.000Z");
    db.prepare(
      "insert into uasgs (codigo_uasg, nome_uasg, raw_json, last_synced_at) values (?, ?, ?, ?)",
    ).run("160292", "COLEGIO MILITAR", "{}", "2026-04-30T00:00:00.000Z");
    db.prepare(
      "insert into user_uasgs (user_id, codigo_uasg, linked_at) values (?, ?, ?)",
    ).run("user-1", "160292", "2026-04-30T00:00:00.000Z");
    repository = new SqliteUserDataSyncRepository(db);
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("syncs ARPs, items and deduplicates CNPJs for a user-linked UASG", async () => {
    vi.mocked(arpsService.consultarArpsPorUasg).mockResolvedValue([
      arpComItensFixture,
      arpWithCnpjFixture,
    ]);
    vi.mocked(pessoasService.consultarPessoaJuridica).mockResolvedValue(cnpjPjDataFixture);

    const service = new UserDataSyncService(repository, arpsService, pessoasService);
    const result = await service.syncUasgForUser("user-1", "160292");

    expect(result.codigoUasg).toBe("160292");
    expect(result.arps).toBe(2);
    expect(result.items).toBe(2);
    expect(result.cnpjs).toBe(2); // two distinct CNPJs
    expect(arpsService.consultarArpsPorUasg).toHaveBeenCalledWith("160292");
    expect(pessoasService.consultarPessoaJuridica).toHaveBeenCalledTimes(2);
  });

  it("throws when UASG is not linked to user", async () => {
    const service = new UserDataSyncService(repository, arpsService, pessoasService);
    await expect(service.syncUasgForUser("user-1", "999999")).rejects.toThrow(
      "UASG not linked to user",
    );
  });

  it("normalizes UASG code before querying", async () => {
    vi.mocked(arpsService.consultarArpsPorUasg).mockResolvedValue([]);
    const service = new UserDataSyncService(repository, arpsService, pessoasService);
    await service.syncUasgForUser("user-1", "160.292");
    expect(arpsService.consultarArpsPorUasg).toHaveBeenCalledWith("160292");
  });

  it("skips items with no niFornecedor", async () => {
    const arpNoSupplier: ArpComItens = {
      ...arpComItensFixture,
      numeroControlePncpAta: "00394452000103-1-018458/2025-000003",
      itens: [
        {
          ...arpComItensFixture.itens[0]!,
          numeroItem: "1",
          niFornecedor: undefined,
        },
      ],
    };
    vi.mocked(arpsService.consultarArpsPorUasg).mockResolvedValue([arpNoSupplier]);
    const service = new UserDataSyncService(repository, arpsService, pessoasService);
    const result = await service.syncUasgForUser("user-1", "160292");
    expect(result.cnpjs).toBe(0);
    expect(pessoasService.consultarPessoaJuridica).not.toHaveBeenCalled();
  });
});
