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

describe("me UASG sync route", () => {
  const auth = { authenticate: vi.fn() } as unknown as AuthService;
  const service = {
    listForUser: vi.fn(),
    addForUser: vi.fn(),
    removeForUser: vi.fn(),
  } as unknown as UserUasgService;
  const sync = {
    syncUasgForUser: vi.fn(),
  } as unknown as UserDataSyncService;

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

  it("requires authentication for sync", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs/160292/sync",
    });
    expect(response.statusCode).toBe(401);
    expect(sync.syncUasgForUser).not.toHaveBeenCalled();
    await app.close();
  });

  it("syncs a UASG for the authenticated user", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(sync.syncUasgForUser).mockResolvedValue({
      codigoUasg: "160292",
      arps: 2,
      items: 5,
      cnpjs: 3,
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs/160292/sync",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sync: {
        codigoUasg: "160292",
        arps: 2,
        items: 5,
        cnpjs: 3,
      },
    });
    expect(sync.syncUasgForUser).toHaveBeenCalledWith("user-1", "160292");
    await app.close();
  });

  it("normalizes UASG code from masked input", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(sync.syncUasgForUser).mockResolvedValue({
      codigoUasg: "160292",
      arps: 0,
      items: 0,
      cnpjs: 0,
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs/160.292/sync",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(200);
    expect(sync.syncUasgForUser).toHaveBeenCalledWith("user-1", "160292");
    await app.close();
  });

  it("returns 400 for invalid UASG code", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs/12345/sync",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("maps 'UASG not linked to user' to 404", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue(user);
    vi.mocked(sync.syncUasgForUser).mockRejectedValue(
      new Error("UASG not linked to user"),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/me/uasgs/160292/sync",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
