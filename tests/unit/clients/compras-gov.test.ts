import axios from "axios";
import {
  ComprasGovApiError,
  HttpComprasGovClient,
} from "../../../src/clients/compras-gov.js";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

describe("HttpComprasGovClient", () => {
  const get = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue({ get } as never);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consults ARPs for a unidade gerenciadora in two 365-day windows", async () => {
    get
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "90018/2025" }] },
      })
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "30002/2024" }] },
      });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    const result = await client.consultarArpsPorUnidadeGerenciadora("160292");

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: "https://dadosabertos.compras.gov.br",
      timeout: 5000,
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, "/modulo-arp/1_consultarARP", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaInicialMin: "2025-05-01",
        dataVigenciaInicialMax: "2026-04-30",
      },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/modulo-arp/1_consultarARP", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaInicialMin: "2024-05-01",
        dataVigenciaInicialMax: "2025-04-30",
      },
    });
    expect(result).toEqual([
      { numeroAtaRegistroPreco: "90018/2025" },
      { numeroAtaRegistroPreco: "30002/2024" },
    ]);
  });

  it("consults items linked to an ARP by numeroControlePncpAta", async () => {
    get.mockResolvedValueOnce({
      data: {
        resultado: [
          {
            numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
            numeroItem: "1",
            descricaoItem: "Tinta acrílica",
          },
        ],
      },
    });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    const result = await client.consultarItensDaArp(
      "00394452000103-1-018458/2025-000002",
    );

    expect(get).toHaveBeenCalledWith("/modulo-arp/2.1_consultarARPItem_Id", {
      params: {
        numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
      },
    });
    expect(result).toEqual([
      {
        numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
        numeroItem: "1",
        descricaoItem: "Tinta acrílica",
      },
    ]);
  });

  it("maps upstream errors to ComprasGovApiError", async () => {
    const upstreamError = {
      response: {
        status: 500,
        data: { message: "upstream unavailable" },
      },
    };
    get.mockRejectedValue(upstreamError);
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    await expect(
      client.consultarArpsPorUnidadeGerenciadora("160292"),
    ).rejects.toMatchObject({
      constructor: ComprasGovApiError,
      statusCode: 500,
      details: { message: "upstream unavailable" },
    });
  });
});
