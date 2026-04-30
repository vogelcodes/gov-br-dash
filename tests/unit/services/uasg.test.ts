import { InMemoryCacheStore } from "../../../src/cache/in-memory.js";
import type { UasgClient, Uasg } from "../../../src/clients/compras-gov.js";
import { CachedUasgService } from "../../../src/services/uasg.js";

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

describe("CachedUasgService", () => {
  it("uses cache for repeated UASG lookups", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(uasgFixture),
    };
    const cache = new InMemoryCacheStore<unknown>({ defaultTtlSeconds: 60, maxEntries: 100 });
    const service = new CachedUasgService(client, cache, { cacheTtlSeconds: 60 });

    await service.consultarUasg("160292");
    await service.consultarUasg("160292");

    expect(client.consultarUasg).toHaveBeenCalledTimes(1);
  });

  it("does not cache null results", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(null),
    };
    const cache = new InMemoryCacheStore<unknown>({ defaultTtlSeconds: 60, maxEntries: 100 });
    const service = new CachedUasgService(client, cache, { cacheTtlSeconds: 60 });

    await service.consultarUasg("999999");
    await service.consultarUasg("999999");

    expect(client.consultarUasg).toHaveBeenCalledTimes(2);
  });

  it("normalizes UASG code before lookup", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(uasgFixture),
    };
    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedUasgService(client, cache);

    await service.consultarUasg("160.292");

    expect(client.consultarUasg).toHaveBeenCalledWith("160292");
  });

  it("rejects invalid UASG codes", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(null),
    };
    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedUasgService(client, cache);

    await expect(service.consultarUasg("abc")).rejects.toThrow(
      "UASG must contain 6 digits",
    );
  });

  it("returns the UASG when found", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(uasgFixture),
    };
    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedUasgService(client, cache);

    const result = await service.consultarUasg("160292");

    expect(result).toEqual(uasgFixture);
  });

  it("returns null when UASG not found", async () => {
    const client: UasgClient = {
      consultarUasg: vi.fn().mockResolvedValue(null),
    };
    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedUasgService(client, cache);

    const result = await service.consultarUasg("999999");

    expect(result).toBeNull();
  });
});
