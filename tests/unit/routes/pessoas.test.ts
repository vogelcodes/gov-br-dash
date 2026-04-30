import Fastify from "fastify";
import { PortalApiError } from "../../../src/clients/portal-transparencia.js";
import { createPessoasRoute } from "../../../src/routes/pessoas.js";
import type { PessoasService } from "../../../src/services/pessoas.js";

describe("pessoas routes", () => {
  const service: PessoasService = {
    consultarPessoaJuridica: vi.fn(),
    consultarPessoaFisica: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when cnpj is missing", async () => {
    const app = Fastify();
    await app.register(createPessoasRoute({ service }));

    const response = await app.inject({
      method: "GET",
      url: "/api/pessoas/juridica",
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("normalizes cnpj and forwards request", async () => {
    const app = Fastify();
    await app.register(createPessoasRoute({ service }));
    vi.mocked(service.consultarPessoaJuridica).mockResolvedValue({ ok: true });

    const response = await app.inject({
      method: "GET",
      url: "/api/pessoas/juridica?cnpj=11.111.111/0001-91",
    });

    expect(response.statusCode).toBe(200);
    expect(service.consultarPessoaJuridica).toHaveBeenCalledWith(
      "11111111000191",
    );
    await app.close();
  });

  it("returns 400 when both cpf and nis are missing", async () => {
    const app = Fastify();
    await app.register(createPessoasRoute({ service }));

    const response = await app.inject({
      method: "GET",
      url: "/api/pessoas/fisica",
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("maps upstream 401 from portal", async () => {
    const app = Fastify();
    await app.register(createPessoasRoute({ service }));
    vi.mocked(service.consultarPessoaFisica).mockRejectedValue(
      new PortalApiError("Unauthorized", 401),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/pessoas/fisica?cpf=12345678901",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
