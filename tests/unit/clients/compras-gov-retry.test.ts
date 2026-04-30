import axios from "axios";
import { HttpComprasGovClient } from "../../../src/clients/compras-gov.js";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

const noSleep = vi.fn().mockResolvedValue(undefined);

describe("HttpComprasGovClient - retries", () => {
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

  it("retries consultarItensDaArp on failure and succeeds on second attempt", async () => {
    get
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroItem: "1", descricaoItem: "Tinta" }] },
      });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      maxRetries: 2,
      sleep: noSleep,
    });

    const result = await client.consultarItensDaArp(
      "00394452000103-1-018458/2025-000001",
    );

    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ numeroItem: "1", descricaoItem: "Tinta" }]);
  });

  it("retries consultarArpsPorUnidadeGerenciadora on failure and succeeds on second attempt", async () => {
    get
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: { resultado: [{ numeroAtaRegistroPreco: "90018/2025" }] },
      })
      .mockResolvedValueOnce({ data: { resultado: [] } });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      maxRetries: 1,
      sleep: noSleep,
    });

    const result = await client.consultarArpsPorUnidadeGerenciadora("160292");

    expect(result).toEqual([{ numeroAtaRegistroPreco: "90018/2025" }]);
  });

  it("retries consultarUasg on failure and succeeds on second attempt", async () => {
    get
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: {
          resultado: [{ codigoUasg: "160292", nomeUasg: "COLEGIO MILITAR" }],
          totalRegistros: 1,
        },
      });

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      maxRetries: 1,
      sleep: noSleep,
    });

    const result = await client.consultarUasg("160292");

    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ codigoUasg: "160292" });
  });

  it("throws after exhausting all retries on consultarItensDaArp", async () => {
    get.mockRejectedValue(new Error("persistent failure"));

    const client = new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      maxRetries: 2,
      sleep: noSleep,
    });

    await expect(
      client.consultarItensDaArp("00394452000103-1-018458/2025-000001"),
    ).rejects.toThrow();

    expect(get).toHaveBeenCalledTimes(3);
  });
});
