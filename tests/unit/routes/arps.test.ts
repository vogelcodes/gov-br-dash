import Fastify from "fastify";
import {
  ComprasGovApiError,
  type Arp,
} from "../../../src/clients/compras-gov.js";
import { createArpsRoute } from "../../../src/routes/arps.js";
import type { ArpsService } from "../../../src/services/arps.js";
import type { UserDataSyncService } from "../../../src/services/user-data-sync.js";

describe("arps routes", () => {
  const arpFixture: Arp = {
    numeroAtaRegistroPreco: "90018/2025",
    codigoUnidadeGerenciadora: "160292",
    nomeUnidadeGerenciadora: "COLEGIO MILITAR DO RIO DE JANEIRO",
    codigoOrgao: 52121,
    nomeOrgao: "COMANDO DO EXERCITO",
    linkAtaPNCP: "https://pncp.gov.br/app/atas/00394452000103/2025/18458/1",
    linkCompraPNCP:
      "https://pncp.gov.br/app/editais/00394452000103/2025/018458",
    numeroCompra: "90018",
    anoCompra: "2025",
    codigoModalidadeCompra: "05",
    nomeModalidadeCompra: "Pregão",
    dataAssinatura: "2025-10-08",
    dataVigenciaInicial: "2025-10-09",
    dataVigenciaFinal: "2026-10-09",
    valorTotal: 494868,
    statusAta: "Ata de Registro de Preços",
    objeto: "Aquisição de tintas e insumos",
    quantidadeItens: 6,
    dataHoraAtualizacao: "2025-10-08T19:51:20",
    dataHoraInclusao: "2025-10-08T19:51:17",
    dataHoraExclusao: null,
    ataExcluido: false,
    numeroControlePncpAta: "00394452000103-1-018458/2025-000001",
    numeroControlePncpCompra: "00394452000103-1-018458/2025",
    idCompra: "16029205900182025",
  };

  const service: ArpsService = {
    consultarArpsPorUasg: vi.fn(),
  };

  const syncService = {
    syncItemsForArps: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserDataSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes UASG and forwards request", async () => {
    const app = Fastify();
    await app.register(createArpsRoute({ service, syncService }));
    vi.mocked(service.consultarArpsPorUasg).mockResolvedValue([arpFixture]);

    const response = await app.inject({
      method: "GET",
      url: "/api/arps/uasg/160.292",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ resultado: [arpFixture] });
    expect(service.consultarArpsPorUasg).toHaveBeenCalledWith("160292");
    await app.close();
  });

  it("fires background item sync after responding", async () => {
    const app = Fastify();
    await app.register(createArpsRoute({ service, syncService }));
    vi.mocked(service.consultarArpsPorUasg).mockResolvedValue([arpFixture]);

    const response = await app.inject({
      method: "GET",
      url: "/api/arps/uasg/160292",
    });

    expect(response.statusCode).toBe(200);
    expect(syncService.syncItemsForArps).toHaveBeenCalledWith("160292", [arpFixture]);
    await app.close();
  });

  it("does not fail the response when background sync rejects", async () => {
    const app = Fastify();
    const failingSync = {
      syncItemsForArps: vi.fn().mockRejectedValue(new Error("sync exploded")),
    } as unknown as UserDataSyncService;
    await app.register(createArpsRoute({ service, syncService: failingSync }));
    vi.mocked(service.consultarArpsPorUasg).mockResolvedValue([arpFixture]);

    const response = await app.inject({
      method: "GET",
      url: "/api/arps/uasg/160292",
    });

    expect(response.statusCode).toBe(200);
    expect(failingSync.syncItemsForArps).toHaveBeenCalled();
    await app.close();
  });

  it("returns 400 when UASG is invalid", async () => {
    const app = Fastify();
    await app.register(createArpsRoute({ service, syncService }));

    const response = await app.inject({
      method: "GET",
      url: "/api/arps/uasg/12345",
    });

    expect(response.statusCode).toBe(400);
    expect(service.consultarArpsPorUasg).not.toHaveBeenCalled();
    await app.close();
  });

  it("maps upstream errors from Compras.gov.br", async () => {
    const app = Fastify();
    await app.register(createArpsRoute({ service, syncService }));
    vi.mocked(service.consultarArpsPorUasg).mockRejectedValue(
      new ComprasGovApiError("Unavailable", 503),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/arps/uasg/160292",
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
