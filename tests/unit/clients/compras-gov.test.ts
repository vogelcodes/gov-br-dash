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
    vi.resetAllMocks();
    vi.mocked(axios.create).mockReturnValue({ get } as never);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consults ARPs by final validity for the current calendar year plus the next two years", async () => {
    get
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "90018/2026" }] },
      })
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "30002/2027" }] },
      })
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "70001/2028" }] },
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
    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenNthCalledWith(1, "/modulo-arp/1.2_consultarARP_FimVigencia", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaFinalMin: "2026-01-01",
        dataVigenciaFinalMax: "2026-12-31",
      },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/modulo-arp/1.2_consultarARP_FimVigencia", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaFinalMin: "2027-01-01",
        dataVigenciaFinalMax: "2027-12-31",
      },
    });
    expect(get).toHaveBeenNthCalledWith(3, "/modulo-arp/1.2_consultarARP_FimVigencia", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaFinalMin: "2028-01-01",
        dataVigenciaFinalMax: "2028-12-31",
      },
    });
    expect(result).toEqual([
      { numeroAtaRegistroPreco: "90018/2026" },
      { numeroAtaRegistroPreco: "30002/2027" },
      { numeroAtaRegistroPreco: "70001/2028" },
    ]);
  });

  it("fetches every ARP page in each date window", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          resultado: [{ numeroAtaRegistroPreco: "90018/2026" }],
          totalPaginas: 2,
        },
      })
      .mockResolvedValueOnce({
        data: {
          resultado: [{ numeroAtaRegistroPreco: "90019/2026" }],
          totalPaginas: 2,
        },
      })
      .mockResolvedValueOnce({
        data: {
          resultado: [{ numeroAtaRegistroPreco: "30002/2027" }],
          totalPaginas: 1,
        },
      })
      .mockResolvedValueOnce({
        data: {
          resultado: [{ numeroAtaRegistroPreco: "40001/2028" }],
          totalPaginas: 1,
        },
      });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    const result = await client.consultarArpsPorUnidadeGerenciadora("160292");

    expect(get).toHaveBeenCalledTimes(4);
    expect(get).toHaveBeenNthCalledWith(2, "/modulo-arp/1.2_consultarARP_FimVigencia", {
      params: {
        pagina: 2,
        tamanhoPagina: 500,
        codigoUnidadeGerenciadora: "160292",
        dataVigenciaFinalMin: "2026-01-01",
        dataVigenciaFinalMax: "2026-12-31",
      },
    });
    expect(result).toEqual([
      { numeroAtaRegistroPreco: "90018/2026" },
      { numeroAtaRegistroPreco: "90019/2026" },
      { numeroAtaRegistroPreco: "30002/2027" },
      { numeroAtaRegistroPreco: "40001/2028" },
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

  it("consults empenhos saldo by numeroAta and unidadeGerenciadora", async () => {
    get.mockResolvedValueOnce({
      data: {
        resultado: [
          {
            numeroItem: "00001",
            quantidadeEmpenhada: 22,
            saldoEmpenho: 0,
          },
        ],
      },
    });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    const result = await client.consultarEmpenhosSaldoItem("00021/2025", "160292");

    expect(get).toHaveBeenCalledWith("/modulo-arp/4_consultarEmpenhosSaldoItem", {
      params: {
        pagina: 1,
        tamanhoPagina: 500,
        numeroAta: "00021/2025",
        unidadeGerenciadora: "160292",
      },
    });
    expect(result).toEqual([
      {
        numeroItem: "00001",
        quantidadeEmpenhada: 22,
        saldoEmpenho: 0,
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
