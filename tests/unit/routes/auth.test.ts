import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createAuthRoutes } from "../../../src/routes/auth.js";
import type { AuthService } from "../../../src/auth/service.js";

describe("auth routes", () => {
  const auth = {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    authenticate: vi.fn(),
  } as unknown as AuthService;

  async function buildApp() {
    const app = Fastify();
    await app.register(cookie, {
      secret: "test-secret-with-at-least-32-characters",
    });
    await app.register(createAuthRoutes({ auth, secureCookies: false }));
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs up a user and sets an HttpOnly session cookie", async () => {
    vi.mocked(auth.signup).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
      createdAt: "2026-04-30T00:00:00.000Z",
    });
    vi.mocked(auth.login).mockResolvedValue({
      token: "a".repeat(64),
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: false,
        createdAt: "2026-04-30T00:00:00.000Z",
      },
      expiresAt: "2026-05-01T00:00:00.000Z",
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: "user@example.com", password: "strong-password" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: false,
        createdAt: "2026-04-30T00:00:00.000Z",
      },
    });
    expect(response.headers["set-cookie"]).toContain("session=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    await app.close();
  });

  it("returns the authenticated current user", async () => {
    vi.mocked(auth.authenticate).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
      createdAt: "2026-04-30T00:00:00.000Z",
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { session: "a".repeat(64) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("user@example.com");
    await app.close();
  });

  it("rejects unauthenticated me requests", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(auth.authenticate).not.toHaveBeenCalled();
    await app.close();
  });
});
