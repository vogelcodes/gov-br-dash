import { api } from "./client";
import type { QuotaInfo, SyncJob, UserUasg } from "./types";

export const uasgsApi = {
  list: () => api<{ uasgs: UserUasg[] }>("GET", "/api/me/uasgs"),
  add: (codigoUasg: string) =>
    api<{ uasg: UserUasg; job: SyncJob | null }>(
      "POST",
      "/api/me/uasgs",
      { codigoUasg },
    ),
  remove: (codigoUasg: string) =>
    api<void>("DELETE", `/api/me/uasgs/${encodeURIComponent(codigoUasg)}`),
  sync: (codigoUasg: string) =>
    api<{ job: SyncJob }>(
      "POST",
      `/api/me/uasgs/${encodeURIComponent(codigoUasg)}/sync`,
    ),
  syncStatus: (codigoUasg: string) =>
    api<{ job: SyncJob | null }>(
      "GET",
      `/api/me/uasgs/${encodeURIComponent(codigoUasg)}/sync-status`,
    ),
  quota: () => api<QuotaInfo>("GET", "/api/me/quota"),
};
