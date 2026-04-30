import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../../src/db/connection.js";
import { initializeSchema } from "../../../src/db/schema.js";
import { SqliteAuthRepository } from "../../../src/db/auth-repository.js";
import { AuthService } from "../../../src/services/auth.js";

describe("AuthService", () => {
  function buildService() {
    const dir = mkdtempSync(join(tmpdir(), "gov-br-auth-"));
    const db = createDatabase(join(dir, "test.sqlite"));
    initializeSchema(db);
    const repository = new SqliteAuthRepository(db);
    const service = new AuthService(repository, { sessionTtlMs: 60 * 60 * 1000 });
    return {
      service,
      repository,
      close() {
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("hashes passwords and stores only a hash of the session token", async () => {
    const ctx = buildService();

    const signup = await ctx.service.signup("User@Example.com", "correct horse battery");
    const storedUser = ctx.repository.findUserByEmail("user@example.com");
    const storedSession = ctx.repository.findSessionByToken(signup.sessionToken);

    expect(signup.user.email).toBe("user@example.com");
    expect(storedUser?.passwordHash).not.toContain("correct horse battery");
    expect(storedSession?.tokenHash).not.toBe(signup.sessionToken);
    expect(storedSession?.userId).toBe(signup.user.id);

    ctx.close();
  });

  it("revokes logout sessions so the same token cannot authenticate again", async () => {
    const ctx = buildService();
    const signup = await ctx.service.signup("user@example.com", "correct horse battery");

    expect(ctx.service.getUserForSession(signup.sessionToken)?.email).toBe("user@example.com");
    ctx.service.logout(signup.sessionToken);

    expect(ctx.service.getUserForSession(signup.sessionToken)).toBeNull();
    ctx.close();
  });
});
