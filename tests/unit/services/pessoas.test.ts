import { InMemoryCacheStore } from "../../../src/cache/in-memory.js";
import type { PortalTransparenciaClient } from "../../../src/clients/portal-transparencia.js";
import { CachedPessoasService } from "../../../src/services/pessoas.js";

describe("CachedPessoasService", () => {
  it("uses cache for repeated pessoa juridica requests", async () => {
    const client: PortalTransparenciaClient = {
      getPessoaJuridica: vi.fn().mockResolvedValue({ cnpj: "11111111000191" }),
      getPessoaFisica: vi.fn().mockResolvedValue({ cpf: "12345678901" }),
    };

    const cache = new InMemoryCacheStore<unknown>({
      defaultTtlSeconds: 60,
      maxEntries: 100,
    });
    const service = new CachedPessoasService(client, cache, {
      cacheTtlSeconds: 60,
    });

    await service.consultarPessoaJuridica("11111111000191");
    await service.consultarPessoaJuridica("11111111000191");

    expect(client.getPessoaJuridica).toHaveBeenCalledTimes(1);
  });

  it("throws when pessoa fisica request has neither cpf nor nis", async () => {
    const client: PortalTransparenciaClient = {
      getPessoaJuridica: vi.fn().mockResolvedValue({ cnpj: "11111111000191" }),
      getPessoaFisica: vi.fn().mockResolvedValue({ cpf: "12345678901" }),
    };

    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedPessoasService(client, cache);

    await expect(service.consultarPessoaFisica({})).rejects.toThrow(
      "Either cpf or nis must be provided",
    );
  });
});
