import { createHash } from "node:crypto";
import type { AppDatabase } from "./connection.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: number;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export class SqliteAuthRepository {
  constructor(private readonly db: AppDatabase) {}

  createUser(user: UserRecord): void {
    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
      VALUES (@id, @email, @passwordHash, @emailVerified, @createdAt, @updatedAt)
    `).run({ ...user, emailVerified: user.emailVerified ? 1 : 0 });
  }

  findUserByEmail(email: string): UserRecord | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    return row ? this.mapUser(row) : null;
  }

  findUserById(id: string): UserRecord | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? this.mapUser(row) : null;
  }

  createSession(session: SessionRecord): void {
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
      VALUES (@id, @userId, @tokenHash, @expiresAt, @revokedAt, @createdAt)
    `).run(session);
  }

  findSessionByToken(token: string): SessionRecord | null {
    const tokenHash = hashToken(token);
    const row = this.db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash) as SessionRow | undefined;
    return row ? this.mapSession(row) : null;
  }

  revokeSession(token: string, revokedAt: string): void {
    this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").run(revokedAt, hashToken(token));
  }

  private mapUser(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSession(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
