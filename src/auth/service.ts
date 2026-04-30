import { randomBytes, randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../db/sqlite.js";
import { hashPassword, hashToken, verifyPassword } from "./credentials.js";

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

interface AuthServiceOptions {
  sessionTtlSeconds?: number;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified: number;
  created_at: string;
}

export class AuthService {
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly db: SqliteDatabase,
    options: AuthServiceOptions = {},
  ) {
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? 60 * 60 * 24 * 30;
  }

  async signup(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();
    const row: UserRow = {
      id: randomUUID(),
      email: normalizedEmail,
      password_hash: await hashPassword(password),
      email_verified: 0,
      created_at: now,
    };

    try {
      this.db
        .prepare(
          "insert into users (id, email, password_hash, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
        )
        .run(
          row.id,
          row.email,
          row.password_hash,
          row.email_verified,
          row.created_at,
          now,
        );
    } catch (error) {
      if (isSqliteConstraint(error)) {
        throw new Error("Email already registered");
      }
      throw error;
    }

    return mapUser(row);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = this.db
      .prepare(
        "select id, email, password_hash, email_verified, created_at from users where email = ?",
      )
      .get(normalizeEmail(email)) as UserRow | undefined;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new Error("Invalid email or password");
    }

    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.sessionTtlSeconds * 1000,
    ).toISOString();
    this.db
      .prepare(
        "insert into sessions (id, user_id, token_hash, expires_at, created_at) values (?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        user.id,
        hashToken(token),
        expiresAt,
        now.toISOString(),
      );

    return { token, user: mapUser(user), expiresAt };
  }

  async authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (!token) {
      return null;
    }

    const row = this.db
      .prepare(
        `select users.id, users.email, users.password_hash, users.email_verified, users.created_at
         from sessions
         join users on users.id = sessions.user_id
         where sessions.token_hash = ?
           and sessions.revoked_at is null
           and sessions.expires_at > ?`,
      )
      .get(hashToken(token), new Date().toISOString()) as UserRow | undefined;

    return row ? mapUser(row) : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    this.db
      .prepare(
        "update sessions set revoked_at = ? where token_hash = ? and revoked_at is null",
      )
      .run(new Date().toISOString(), hashToken(token));
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

function isSqliteConstraint(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}
