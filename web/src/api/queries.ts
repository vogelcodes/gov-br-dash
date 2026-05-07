import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { authApi } from "./auth";
import { uasgsApi } from "./uasgs";
import { arpsApi } from "./arps";

export const qk = {
  authMe: ["auth", "me"] as const,
  uasgs: ["uasgs"] as const,
  arpsSummary: (codigoUasg: string) =>
    ["uasg", codigoUasg, "arps-summary"] as const,
  syncStatus: (codigoUasg: string) =>
    ["uasg", codigoUasg, "sync-status"] as const,
  items: (ata: string) => ["arp", ata, "items"] as const,
  empenhos: (ata: string) => ["arp", ata, "empenhos"] as const,
};

// --- Auth ---

export function useMe() {
  return useQuery({
    queryKey: qk.authMe,
    queryFn: () => authApi.me(),
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      authApi.login(vars.email, vars.password),
    onSuccess: (data) => {
      qc.setQueryData(qk.authMe, { user: data.user });
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      authApi.signup(vars.email, vars.password),
    onSuccess: (data) => {
      qc.setQueryData(qk.authMe, { user: data.user });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.setQueryData(qk.authMe, { user: null });
      qc.removeQueries({ queryKey: ["uasg"] });
      qc.removeQueries({ queryKey: ["arp"] });
      qc.removeQueries({ queryKey: ["uasgs"] });
    },
  });
}

// --- UASGs ---

export function useUasgs() {
  return useQuery({
    queryKey: qk.uasgs,
    queryFn: () => uasgsApi.list(),
  });
}

export function useAddUasg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigoUasg: string) => uasgsApi.add(codigoUasg),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.uasgs }),
  });
}

export function useRemoveUasg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigoUasg: string) => uasgsApi.remove(codigoUasg),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.uasgs }),
  });
}

// --- Sync ---

export function useUasgJob(codigoUasg: string, forceActive = false) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.syncStatus(codigoUasg),
    queryFn: async () => {
      const data = await uasgsApi.syncStatus(codigoUasg);
      const status = data.job?.status;
      // Job finished — refresh dependent data so blurred panels populate.
      if (status === "done" || status === "failed" || status === "cancelled") {
        qc.invalidateQueries({ queryKey: qk.arpsSummary(codigoUasg) });
      }
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      const active = status === "queued" || status === "running";
      return forceActive || active ? 1000 : false;
    },
    staleTime: 0,
  });
}

export function useTriggerSync(codigoUasg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => uasgsApi.sync(codigoUasg),
    onMutate: () => {
      qc.invalidateQueries({ queryKey: qk.syncStatus(codigoUasg) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.syncStatus(codigoUasg) });
      qc.invalidateQueries({ queryKey: ["quota"] });
    },
  });
}

export function useQuota() {
  return useQuery({
    queryKey: ["quota"] as const,
    queryFn: () => uasgsApi.quota(),
    staleTime: 30_000,
  });
}

// --- ARPs ---

export function useArpsSummary(codigoUasg: string) {
  return useQuery({
    queryKey: qk.arpsSummary(codigoUasg),
    queryFn: () => arpsApi.summary(codigoUasg),
  });
}

export function useArpItems(ata: string | undefined) {
  return useQuery({
    queryKey: ata ? qk.items(ata) : ["arp", "noop", "items"],
    queryFn: () => arpsApi.items(ata!),
    enabled: !!ata,
  });
}

export function useArpEmpenhos(ata: string | undefined) {
  return useQuery({
    queryKey: ata ? qk.empenhos(ata) : ["arp", "noop", "empenhos"],
    queryFn: () => arpsApi.empenhos(ata!),
    enabled: !!ata,
  });
}

export function useRefreshArp(codigoUasg: string, ata: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => arpsApi.refreshArp(ata),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.items(ata) });
      qc.invalidateQueries({ queryKey: qk.empenhos(ata) });
      qc.invalidateQueries({ queryKey: qk.arpsSummary(codigoUasg) });
    },
  });
}

export function useRefreshItem(
  codigoUasg: string,
  ata: string,
  numeroItem: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => arpsApi.refreshItem(ata, numeroItem),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.items(ata) });
      qc.invalidateQueries({ queryKey: qk.empenhos(ata) });
      qc.invalidateQueries({ queryKey: qk.arpsSummary(codigoUasg) });
    },
  });
}
