import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createMeUasgsRoutes } from "../../../src/routes/me-uasgs.js";
import type { AuthService } from "../../../src/auth/service.js";
import type { UserUasgService } from "../../../src/services/user-uasgs.js";
import type { UserDataSyncService } from "../../../src/services/user-data-sync.js";

const user = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: false,
  createdAt: "2026-04-30T00:00:00.000Z",
};

describe("me UASG routes", () => {
  const auth = { authenticate: vi.fn() } as unknown as AuthService;
  const service = {
    listForUser: vi.fn(),
    addForUser: vi.fn(),
    removeForUser: vi.fn(),
  } as unknown as UserUasgService;
  const sync = { syncUasgForUser: vi.fn() } as unknown as UserDataSyncService;

  async function buildApp() {
    const app = Fastify();
    await app.register(cookie, {
      secret: "test-secret-with-at-least-32-characters",
    });
    await app.register(createMeUasgsRoutes({ auth, service, sync }));
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/me/uasgs" });

    expect(response.statusCode).toBe(401);
    expect(service.listForUser).not.toHaveBeenCalled();
    await app.close();
  });

  it("lists linked UASGs for the current user", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(service.listForUser).mockResolvedValue([
      {
        codigoUasg: "160292",
        nomeUasg: "COLEGIO MILITAR",
        linkedAt: "2026-04-30T00:00:00.000Z",
      },
    ]);
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/me/uasgs",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      uasgs: [
        {
          codigoUasg: "160292",
          nomeUasg: "COLEGIO MILITAR",
          linkedAt: "2026-04-30T00:00:00.000Z",
        },
      ],
    });
    expect(service.listForUser).toHaveBeenCalledWith("user-1");
    await app.close();
  });

  it("adds a normalized UASG link", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(service.addForUser).mockResolvedValue({
      codigoUasg: "160292",
      nomeUasg: "COLEGIO MILITAR",
      linkedAt: "2026-04-30T00:00:00.000Z",
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session: "a".repeat(64) },
      payload: { codigoUasg: "160.292" },
    });

    expect(response.statusCode).toBe(201);
    expect(service.addForUser).toHaveBeenCalledWith("user-1", "160292");
    await app.close();
  });

  it("maps the three-UASG limit to 409", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(service.addForUser).mockRejectedValue(
      new Error("UASG limit reached"),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs",
      cookies: { session: "a".repeat(64) },
      payload: { codigoUasg: "160292" },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });
});
