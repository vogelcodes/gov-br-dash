import { describe, it, expect, vi } from "vitest";
import { UserUasgService } from "../../../src/services/user-uasgs.js";
import type { UasgClient, Uasg } from "../../../src/clients/compras-gov.js";
import type { SqliteUserUasgRepository, LinkedUasgRecord } from "../../../src/db/user-uasg-repository.js";

function uasgFixture(codigoUasg: string): Uasg {
  return {
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
  };
}

describe("UserUasgService method aliases", () => {
  it("listForUser is an alias for list", () => {
    const mockRepo = {
      listForUser: vi.fn(() => []),
      userHasUasg: vi.fn(() => false),
      countForUser: vi.fn(() => 0),
      linkUasg: vi.fn(),
      unlinkUasg: vi.fn(),
    } as unknown as SqliteUserUasgRepository;
    const mockClient = { consultarUasg: vi.fn() } as unknown as UasgClient;
    const service = new UserUasgService(mockRepo, mockClient);

    service.listForUser("user-1");

    expect(mockRepo.listForUser).toHaveBeenCalledOnce();
    expect(mockRepo.listForUser).toHaveBeenCalledWith("user-1");
  });

  it("addForUser calls link and returns the linked record", async () => {
    const linkedRecord: LinkedUasgRecord = {
      codigoUasg: "160292",
      nomeUasg: "UASG 160292",
      raw: uasgFixture("160292"),
      linkedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };
    const mockRepo = {
      listForUser: vi.fn(() => []),
      userHasUasg: vi.fn(() => false),
      countForUser: vi.fn(() => 0),
      linkUasg: vi.fn(() => linkedRecord),
      unlinkUasg: vi.fn(),
    } as unknown as SqliteUserUasgRepository;
    const mockClient = {
      consultarUasg: vi.fn(async () => uasgFixture("160292")),
    } as unknown as UasgClient;
    const service = new UserUasgService(mockRepo, mockClient);

    const result = await service.addForUser("user-1", "160292");

    expect(result).toEqual(linkedRecord);
    expect(mockClient.consultarUasg).toHaveBeenCalledOnce();
  });

  it("removeForUser calls unlink and returns true on success", () => {
    const mockRepo = {
      listForUser: vi.fn(() => []),
      userHasUasg: vi.fn(() => false),
      countForUser: vi.fn(() => 0),
      linkUasg: vi.fn(),
      unlinkUasg: vi.fn(() => true),
    } as unknown as SqliteUserUasgRepository;
    const mockClient = { consultarUasg: vi.fn() } as unknown as UasgClient;
    const service = new UserUasgService(mockRepo, mockClient);

    const result = service.removeForUser("user-1", "160292");

    expect(result).toBe(true);
    expect(mockRepo.unlinkUasg).toHaveBeenCalledOnce();
  });
});
