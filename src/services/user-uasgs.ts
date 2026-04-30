import type { UasgClient } from "../clients/compras-gov.js";
import type { LinkedUasgRecord, SqliteUserUasgRepository } from "../db/user-uasg-repository.js";
import { AuthError } from "./auth.js";

export class UserUasgService {
  constructor(
    private readonly repository: SqliteUserUasgRepository,
    private readonly uasgClient: UasgClient,
  ) {}

  list(userId: string): LinkedUasgRecord[] {
    return this.repository.listForUser(userId);
  }

  listForUser(userId: string): LinkedUasgRecord[] {
    return this.list(userId);
  }

  async link(userId: string, codigoUasg: string): Promise<LinkedUasgRecord> {
    const normalizedCodigoUasg = normalizeUasg(codigoUasg);
    if (this.repository.userHasUasg(userId, normalizedCodigoUasg)) {
      const existing = this.repository.listForUser(userId).find((uasg) => uasg.codigoUasg === normalizedCodigoUasg);
      if (!existing) {
        throw new AuthError("Linked UASG not found", 404);
      }
      return existing;
    }
    if (this.repository.countForUser(userId) >= 3) {
      throw new AuthError("Each user can link at most 3 UASGs", 409);
    }
    const uasg = await this.uasgClient.consultarUasg(normalizedCodigoUasg);
    if (!uasg) {
      throw new AuthError("UASG not found", 404);
    }
    return this.repository.linkUasg(userId, uasg);
  }

  async addForUser(userId: string, codigoUasg: string): Promise<LinkedUasgRecord> {
    return this.link(userId, codigoUasg);
  }

  unlink(userId: string, codigoUasg: string): boolean {
    return this.repository.unlinkUasg(userId, normalizeUasg(codigoUasg));
  }

  removeForUser(userId: string, codigoUasg: string): boolean {
    return this.unlink(userId, codigoUasg);
  }

  assertOwnsUasg(userId: string, codigoUasg: string): void {
    if (!this.repository.userHasUasg(userId, normalizeUasg(codigoUasg))) {
      throw new AuthError("UASG is not linked to this user", 403);
    }
  }
}

export function normalizeUasg(codigoUasg: string): string {
  const normalized = codigoUasg.replace(/\D/g, "");
  if (normalized.length !== 6) {
    throw new AuthError("codigoUasg must contain 6 digits", 400);
  }
  return normalized;
}
