import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase } from "../../../src/db/sqlite.js";
import {
  SqliteUserUasgRepository,
  UserUasgService,
} from "../../../src/services/user-uasgs.js";
import type { UasgService } from "../../../src/services/uasg.js";
import type { Uasg } from "../../../src/clients/compras-gov.js";

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

describe("UserUasgService", () => {
  let dir: string;
  let db: ReturnType<typeof createSqliteDatabase>;
  let service: UserUasgService;
  const uasgService: UasgService = { consultarUasg: vi.fn() };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gov-br-dash-uasgs-"));
    db = createSqliteDatabase(join(dir, "app.sqlite"));
    db.prepare(
      "insert into users (id, email, password_hash, email_verified, created_at, updated_at) values (?, ?, ?, 0, ?, ?)",
    ).run(
      "user-1",
      "user@example.com",
      "hash",
      "2026-04-30T00:00:00.000Z",
      "2026-04-30T00:00:00.000Z",
    );
    service = new UserUasgService(
      new SqliteUserUasgRepository(db),
      uasgService,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("validates through the existing UASG service and persists metadata", async () => {
    vi.mocked(uasgService.consultarUasg).mockResolvedValue(uasgFixture);

    const linked = await service.addForUser("user-1", "160.292");

    expect(linked.codigoUasg).toBe("160292");
    expect(linked.nomeUasg).toBe("COLEGIO MILITAR DO RIO DE JANEIRO");
    expect(uasgService.consultarUasg).toHaveBeenCalledWith("160292");
    await expect(service.listForUser("user-1")).resolves.toHaveLength(1);
  });

  it("prevents more than three simultaneous UASG links", async () => {
    vi.mocked(uasgService.consultarUasg).mockResolvedValue(uasgFixture);
    await service.addForUser("user-1", "160001");
    await service.addForUser("user-1", "160002");
    await service.addForUser("user-1", "160003");

    await expect(service.addForUser("user-1", "160004")).rejects.toThrow(
      "UASG limit reached",
    );
  });

  it("removes a linked UASG", async () => {
    vi.mocked(uasgService.consultarUasg).mockResolvedValue(uasgFixture);
    await service.addForUser("user-1", "160292");

    await service.removeForUser("user-1", "160292");

    await expect(service.listForUser("user-1")).resolves.toEqual([]);
  });
});
