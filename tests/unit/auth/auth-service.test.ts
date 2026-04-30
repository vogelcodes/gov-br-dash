import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase } from "../../../src/db/sqlite.js";
import { AuthService } from "../../../src/auth/service.js";

describe("AuthService", () => {
  let dir: string;
  let db: ReturnType<typeof createSqliteDatabase>;
  let service: AuthService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gov-br-dash-auth-"));
    db = createSqliteDatabase(join(dir, "app.sqlite"));
    service = new AuthService(db, { sessionTtlSeconds: 3600 });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a user with a normalized unique email and never stores the raw password", async () => {
    const user = await service.signup(" User@Example.COM ", "strong-password");

    expect(user.email).toBe("user@example.com");
    expect(user.emailVerified).toBe(false);
    const row = db
      .prepare("select email, password_hash from users where id = ?")
      .get(user.id) as { email: string; password_hash: string };
    expect(row.email).toBe("user@example.com");
    expect(row.password_hash).not.toContain("strong-password");
    await expect(
      service.signup("user@example.com", "another-password"),
    ).rejects.toThrow("Email already registered");
  });

  it("creates opaque sessions on login and authenticates by raw token", async () => {
    const user = await service.signup("user@example.com", "strong-password");

    const session = await service.login("USER@example.com", "strong-password");

    expect(session.token).toHaveLength(64);
    expect(session.user.id).toBe(user.id);
    const stored = db
      .prepare("select token_hash from sessions where user_id = ?")
      .get(user.id) as { token_hash: string };
    expect(stored.token_hash).not.toBe(session.token);
    await expect(
      service.login("user@example.com", "wrong-password"),
    ).rejects.toThrow("Invalid email or password");
    await expect(service.authenticate(session.token)).resolves.toMatchObject({
      id: user.id,
    });
  });

  it("revokes sessions on logout", async () => {
    await service.signup("user@example.com", "strong-password");
    const session = await service.login("user@example.com", "strong-password");

    await service.logout(session.token);

    await expect(service.authenticate(session.token)).resolves.toBeNull();
  });
});
