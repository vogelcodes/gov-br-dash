import Fastify from "fastify";
import {
  ComprasGovApiError,
  type Uasg,
} from "../../../src/clients/compras-gov.js";
import { createUasgRoute } from "../../../src/routes/uasg.js";
import type { UasgService } from "../../../src/services/uasg.js";

describe("uasg routes", () => {
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

  const service: UasgService = {
    consultarUasg: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes UASG and returns result", async () => {
    const app = Fastify();
    await app.register(createUasgRoute({ service }));
    vi.mocked(service.consultarUasg).mockResolvedValue(uasgFixture);

    const response = await app.inject({
      method: "GET",
      url: "/api/uasg/160.292",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ resultado: uasgFixture });
    expect(service.consultarUasg).toHaveBeenCalledWith("160292");
    await app.close();
  });

  it("returns 404 when UASG not found", async () => {
    const app = Fastify();
    await app.register(createUasgRoute({ service }));
    vi.mocked(service.consultarUasg).mockResolvedValue(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/uasg/999999",
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 400 when UASG code is invalid", async () => {
    const app = Fastify();
    await app.register(createUasgRoute({ service }));

    const response = await app.inject({
      method: "GET",
      url: "/api/uasg/12345",
    });

    expect(response.statusCode).toBe(400);
    expect(service.consultarUasg).not.toHaveBeenCalled();
    await app.close();
  });

  it("maps upstream errors from Compras.gov.br", async () => {
    const app = Fastify();
    await app.register(createUasgRoute({ service }));
    vi.mocked(service.consultarUasg).mockRejectedValue(
      new ComprasGovApiError("Unavailable", 503),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/uasg/160292",
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
