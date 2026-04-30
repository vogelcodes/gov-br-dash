import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { SqliteAuthRepository, UserRecord } from "../db/auth-repository.js";
import { hashToken } from "../db/auth-repository.js";

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResult {
  user: PublicUser;
  sessionToken: string;
  expiresAt: string;
}

interface AuthServiceOptions {
  sessionTtlMs?: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export class AuthService {
  private readonly sessionTtlMs: number;

  constructor(
    private readonly repository: SqliteAuthRepository,
    options: AuthServiceOptions = {},
  ) {
    this.sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 24 * 30;
  }

  async signup(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(email);
    validatePassword(password);

    if (this.repository.findUserByEmail(normalizedEmail)) {
      throw new AuthError("Email already registered", 409);
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.createUser(user);
    return this.createSessionForUser(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = this.repository.findUserByEmail(normalizeEmail(email));
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AuthError("Invalid email or password", 401);
    }
    return this.createSessionForUser(user);
  }

  logout(sessionToken: string): void {
    this.repository.revokeSession(sessionToken, new Date().toISOString());
  }

  getUserForSession(sessionToken: string | undefined): PublicUser | null {
    if (!sessionToken) {
      return null;
    }
    const session = this.repository.findSessionByToken(sessionToken);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      return null;
    }
    const user = this.repository.findUserById(session.userId);
    return user ? toPublicUser(user) : null;
  }

  private createSessionForUser(user: UserRecord): AuthResult {
    const now = new Date();
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs).toISOString();

    this.repository.createSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      revokedAt: null,
      createdAt: now.toISOString(),
    });

    return { user: toPublicUser(user), sessionToken, expiresAt };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new AuthError("Password must contain at least 12 characters", 400);
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }
  const candidate = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expected = Buffer.from(hash);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
