import { api } from "./client";
import type { PublicUser } from "./types";

export const authApi = {
  me: () => api<{ user: PublicUser | null }>("GET", "/api/auth/me"),
  login: (email: string, password: string) =>
    api<{ user: PublicUser }>("POST", "/api/auth/login", { email, password }),
  signup: (email: string, password: string) =>
    api<{ user: PublicUser }>("POST", "/api/auth/signup", { email, password }),
  logout: () => api<void>("POST", "/api/auth/logout"),
};
