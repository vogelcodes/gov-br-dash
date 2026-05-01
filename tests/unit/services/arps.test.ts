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
      consultarItensDaArp: vi.fn(),
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
    expect(client.consultarItensDaArp).not.toHaveBeenCalled();
  });

  it("returns ARPs without fetching items", async () => {
    const arp = {
      numeroAtaRegistroPreco: "90118/2025",
      numeroControlePncpAta: "00394452000103-1-018458/2025-000002",
    };

    const client: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([arp]),
      consultarItensDaArp: vi.fn(),
    };

    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedArpsService(client, cache);

    const result = await service.consultarArpsPorUasg("160292");

    expect(client.consultarItensDaArp).not.toHaveBeenCalled();
    expect(result).toEqual([arp]);
  });

  it("rejects invalid UASG codes", async () => {
    const client: ComprasGovClient = {
      consultarArpsPorUnidadeGerenciadora: vi.fn().mockResolvedValue([]),
      consultarItensDaArp: vi.fn(),
    };

    const cache = new InMemoryCacheStore<unknown>();
    const service = new CachedArpsService(client, cache);

    await expect(service.consultarArpsPorUasg("abc")).rejects.toThrow(
      "UASG must contain 6 digits",
    );
  });
});
