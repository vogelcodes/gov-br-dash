import axios from "axios";
import {
  ComprasGovApiError,
  HttpComprasGovClient,
  type Uasg,
} from "../../../src/clients/compras-gov.js";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

describe("HttpComprasGovClient - consultarUasg", () => {
  const get = vi.fn();

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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue({ get } as never);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  it("queries the UASG endpoint with codigoUasg and statusUasg=true", async () => {
    get.mockResolvedValueOnce({
      data: {
        resultado: [uasgFixture],
        totalRegistros: 1,
        totalPaginas: 1,
        paginasRestantes: 0,
      },
    });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      minRequestIntervalMs: 0,
    });

    const result = await client.consultarUasg("160292");

    expect(get).toHaveBeenCalledWith("/modulo-uasg/1_consultarUasg", {
      params: {
        codigoUasg: "160292",
        statusUasg: true,
        pagina: 1,
      },
    });
    expect(result).toEqual(uasgFixture);
  });

  it("returns null when resultado is empty", async () => {
    get.mockResolvedValueOnce({
      data: { resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 },
    });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      minRequestIntervalMs: 0,
    });

    const result = await client.consultarUasg("999999");

    expect(result).toBeNull();
  });

  it("maps non-transient upstream errors to ComprasGovApiError", async () => {
    get.mockRejectedValue({ response: { status: 400, data: { message: "bad request" } } });
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      minRequestIntervalMs: 0,
      maxRetries: 0,
    });

    await expect(client.consultarUasg("160292")).rejects.toMatchObject({
      constructor: ComprasGovApiError,
      statusCode: 400,
    });
  });

  it("retries 503 transient errors and eventually succeeds", async () => {
    get
      .mockRejectedValueOnce({ response: { status: 503, data: { message: "unavailable" } } })
      .mockResolvedValueOnce({ data: { resultado: [], totalRegistros: 0 } });
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      minRequestIntervalMs: 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await client.consultarUasg("160292");
    expect(result).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
