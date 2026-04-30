import { InMemoryCacheStore } from "../../../src/cache/in-memory.js";
import type { ComprasGovClient } from "../../../src/clients/compras-gov.js";
import { CachedArpsService } from "../../../src/services/arps.js";

describe("CachedArpsService", () => {
  it("uses cache for repeated ARP requests by UASG", async () => {
    const client: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([
        {
          numeroAtaRegistroPreco: "90018/2025",
          numeroControlePncpAta: "00394452000103-1-018458/2025-000001",
        },
      ]),
      consultarItensDaArp: vi.fn().mockResolvedValue([
        {
          numeroItem: "1",
          descricaoItem: "Tinta acrílica",
        },
      ]),
    };

    const cache = new InMemoryCacheStore<unknown>({
      defaultTtlSeconds: 60,
      maxEntries: 100,
    });
    const service = new CachedArpsService(client, cache, {
      cacheTtlSeconds: 60,
    });

    await service.consultarArpsPorUasg("160292");
    await service.consultarArpsPorUasg("160292");

    expect(client.consultarArpsPorUnidadeGerenciadora).toHaveBeenCalledTimes(1);
    expect(client.consultarItensDaArp).toHaveBeenCalledTimes(1);
  });

  it("returns ARPs enriched with their linked items", async () => {
    const client: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([
        {
          numeroAtaRegistroPreco: "90118/2025",
          numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
        },
      ]),
      consultarItensDaArp: vi.fn().mockResolvedValue([
        {
          numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
          numeroItem: "1",
          descricaoItem: "Tinta acrílica",
        },
      ]),
    };

    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedArpsService(client, cache);

    const result = await service.consultarArpsPorUasg("160292");

    expect(client.consultarItensDaArp).toHaveBeenCalledWith(
      "00394452000103-1-018458/2025-000002",
    );
    expect(result).toEqual([
      {
        numeroAtaRegistroPreco: "90118/2025",
        numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
        itens: [
          {
            numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
            numeroItem: "1",
            descricaoItem: "Tinta acrílica",
          },
        ],
      },
    ]);
  });

  it("rejects invalid UASG codes", async () => {
    const client: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([]),
      consultarItensDaArp: vi.fn().mockResolvedValue([]),
    };

    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedArpsService(client, cache);

    await expect(service.consultarArpsPorUasg("abc")).rejects.toThrow(
      "UASG must contain 6 digits",
    );
  });
});
