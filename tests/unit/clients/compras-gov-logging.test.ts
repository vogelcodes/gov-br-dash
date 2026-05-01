import axios from "axios";
import { HttpComprasGovClient } from "../../../src/clients/compras-gov.js";

vi.mock("axios", () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

describe("HttpComprasGovClient - logging", () => {
  const get = vi.fn();
  const interceptorUseMock = vi.fn();
  let capturedErrorHandler: ((error: unknown) => Promise<unknown>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.isAxiosError).mockReturnValue(false);

    interceptorUseMock.mockImplementation((_ok, errorHandler) => {
      capturedErrorHandler = errorHandler;
    });

    vi.mocked(axios.create).mockReturnValue({
      get,
      interceptors: { response: { use: interceptorUseMock } },
    } as never);
  });

  it("logs warn with endpoint, params, status, and body on failed request", async () => {
    const logger = { warn: vi.fn() };
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      logger,
    });

    const fakeError = {
      config: {
        url: "/modulo-arp/2.1_consultarARPItem_Id",
        params: {
          numeroControlePncpAta: "00394452000103-1-018458/2025-000001",
        },
      },
      response: {
        status: 400,
        data: "Erro ao efetuar a consulta Could not open JPA EntityManager for transaction",
      },
    };

    await expect(capturedErrorHandler!(fakeError)).rejects.toEqual(fakeError);

    expect(logger.warn).toHaveBeenCalledWith(
      {
        endpoint: "/modulo-arp/2.1_consultarARPItem_Id",
        params: {
          numeroControlePncpAta: "00394452000103-1-018458/2025-000001",
        },
        status: 400,
        fullUrl: "/modulo-arp/2.1_consultarARPItem_Id",
        body: "Erro ao efetuar a consulta Could not open JPA EntityManager for transaction",
      },
      "Compras.gov.br request failed",
    );
  });

  it("does not log non-axios errors", async () => {
    const logger = { warn: vi.fn() };
    vi.mocked(axios.isAxiosError).mockReturnValue(false);

    new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
      logger,
    });

    const nonAxiosError = new Error("unexpected");
    await expect(capturedErrorHandler!(nonAxiosError)).rejects.toEqual(
      nonAxiosError,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not register interceptor when no logger is provided", async () => {
    new HttpComprasGovClient({
      baseUrl: "https://dadosabertos.compras.gov.br",
      timeoutMs: 5000,
    });

    expect(interceptorUseMock).not.toHaveBeenCalled();
  });
});
