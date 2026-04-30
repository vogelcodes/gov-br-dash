import { describe, it, expect, vi } from "vitest";
import { UserDataSyncService } from "../../../src/services/user-data-sync.js";
import type { ComprasGovClient, Arp } from "../../../src/clients/compras-gov.js";
import type { PortalTransparenciaClient } from "../../../src/clients/portal-transparencia.js";
import type { SqliteSyncRepository } from "../../../src/db/sync-repository.js";

describe("UserDataSyncService syncUasgForUser", () => {
  it("syncUasgForUser calls syncUasg with the given codigoUasg", async () => {
    const mockRepo = {
      findArp: vi.fn(),
      userOwnsArp: vi.fn(),
      userOwnsItem: vi.fn(),
      userOwnsPessoaJuridica: vi.fn(),
      upsertArp: vi.fn(),
      upsertArpItem: vi.fn(),
      upsertPessoaJuridica: vi.fn(),
      upsertEmpenho: vi.fn(),
    } as unknown as SqliteSyncRepository;

    const mockCompras = {
      consultarArpsPorUnidadeGerenciadora: vi.fn(async () => [] as Arp[]),
    } as unknown as ComprasGovClient;

    const mockPortal = {} as PortalTransparenciaClient;

    const service = new UserDataSyncService(mockRepo, mockCompras, mockPortal);
    const spy = vi.spyOn(service, "syncUasg");

    await service.syncUasgForUser("user-1", "160292");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("160292");
  });
});
