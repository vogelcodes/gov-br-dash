import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { AuthError, type AuthService } from "../services/auth.js";
import type { UserDataSyncService } from "../services/user-data-sync.js";
import type { UserUasgService } from "../services/user-uasgs.js";
import type { SqliteSyncJobRepository } from "../db/sync-job-repository.js";
import {
  QuotaExceededError,
  type SyncQuotaService,
} from "../services/sync-quota.js";
import { authenticate, type AuthenticatedRequest } from "./auth.js";
import { sendUserDataError } from "./user-uasgs.js";

const uasgParamsSchema = z.object({ codigoUasg: z.string().min(1) });
const arpParamsSchema = z.object({ numeroControlePncpAta: z.string().min(1) });
const arpItemParamsSchema = arpParamsSchema.extend({ numeroItem: z.string().min(1) });
const cnpjParamsSchema = z.object({ cnpj: z.string().min(1) });
const jobParamsSchema = z.object({ jobId: z.string().min(1) });

interface UserSyncRouteDeps {
  authService: AuthService;
  userUasgService: UserUasgService;
  syncService: UserDataSyncService;
  jobRepository: SqliteSyncJobRepository;
  quotaService: SyncQuotaService;
}

export function createUserSyncRoutes(deps: UserSyncRouteDeps) {
  return async function userSyncRoutes(fastify: FastifyInstance) {
    fastify.addHook("preHandler", authenticate(deps.authService));

    fastify.get<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/arps",
      async (request, reply) => {
        const params = uasgParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          deps.userUasgService.assertOwnsUasg(user.id, params.data.codigoUasg);
          const arps = deps.syncService.listArpsForUasg(params.data.codigoUasg);
          return reply.code(200).send({ arps });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/items",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const items = deps.syncService.listItemsForArp(params.data.numeroControlePncpAta);
          return reply.code(200).send({ items });
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/arps/summary",
      async (request, reply) => {
        const params = uasgParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          deps.userUasgService.assertOwnsUasg(user.id, params.data.codigoUasg);
          const arps = deps.syncService.listArpSummariesForUasg(params.data.codigoUasg);
          return reply.code(200).send({ arps });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/sync-status",
      async (request, reply) => {
        const params = uasgParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          deps.userUasgService.assertOwnsUasg(user.id, params.data.codigoUasg);
          const job =
            deps.jobRepository.findActiveForUasg(user.id, params.data.codigoUasg) ??
            deps.jobRepository.findLatestForUasg(user.id, params.data.codigoUasg);
          return reply.code(200).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/jobs/:jobId",
      async (request, reply) => {
        const params = jobParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          const job = deps.jobRepository.findById(params.data.jobId);
          if (!job || job.userId !== user.id) {
            return reply.code(404).send({ message: "Job not found" });
          }
          return reply.code(200).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/jobs/:jobId/cancel",
      async (request, reply) => {
        const params = jobParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          const cancelled = deps.jobRepository.cancel(params.data.jobId, user.id);
          if (!cancelled) {
            const job = deps.jobRepository.findById(params.data.jobId);
            if (!job || job.userId !== user.id) {
              return reply.code(404).send({ message: "Job not found" });
            }
            return reply.code(409).send({ message: "Job already finished", job });
          }
          const job = deps.jobRepository.findById(params.data.jobId);
          return reply.code(200).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get("/api/me/quota", async (request, reply) => {
      try {
        const user = (request as AuthenticatedRequest).user;
        return reply.code(200).send(deps.quotaService.getStatus(user.id));
      } catch (error) {
        return sendUserDataError(reply, error);
      }
    });

    fastify.get<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/empenhos",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const empenhosByItem = deps.syncService.listEmpenhosForArp(params.data.numeroControlePncpAta);
          const pessoasJuridicasByCnpj = deps.syncService.listPessoasJuridicasForArp(params.data.numeroControlePncpAta);
          return reply.code(200).send({ empenhosByItem, pessoasJuridicasByCnpj });
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/sync",
      async (request, reply) => {
        const params = uasgParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          deps.userUasgService.assertOwnsUasg(user.id, params.data.codigoUasg);
          const active = deps.jobRepository.findActiveForUasg(
            user.id,
            params.data.codigoUasg,
          );
          if (active) {
            return reply.code(409).send({ message: "Sync already in progress", job: active });
          }
          try {
            deps.quotaService.assertCanEnqueue(user.id);
          } catch (err) {
            if (err instanceof QuotaExceededError) {
              return reply
                .code(429)
                .header("Retry-After", err.resetsAt)
                .send({ message: err.message, resetsAt: err.resetsAt });
            }
            throw err;
          }
          const job = deps.jobRepository.enqueue(user.id, params.data.codigoUasg);
          return reply.code(202).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/refresh",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const result = await deps.syncService.refreshArp(params.data.numeroControlePncpAta);
          return reply.code(200).send({ result });
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/items/:numeroItem/refresh",
      async (request, reply) => {
        const params = arpItemParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsItem(user.id, params.data.numeroControlePncpAta, params.data.numeroItem)) {
            return reply.code(404).send({ message: "ARP item not found for user" });
          }
          const result = await deps.syncService.refreshItem(params.data.numeroControlePncpAta, params.data.numeroItem);
          return reply.code(200).send({ result });
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/items/:numeroItem/empenhos/refresh",
      async (request, reply) => {
        const params = arpItemParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsItem(user.id, params.data.numeroControlePncpAta, params.data.numeroItem)) {
            return reply.code(404).send({ message: "ARP item not found for user" });
          }
          const result = await deps.syncService.refreshItemEmpenhos(params.data.numeroControlePncpAta, params.data.numeroItem);
          return reply.code(200).send({ result });
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/pessoas-juridicas/:cnpj/refresh",
      async (request, reply) => {
        const params = cnpjParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncService.userOwnsPessoaJuridica(user.id, params.data.cnpj)) {
            return reply.code(404).send({ message: "Pessoa juridica not found for user" });
          }
          await deps.syncService.refreshPessoaJuridica(params.data.cnpj);
          return reply.code(204).send();
        } catch (error) {
          return sendRefreshError(reply, error);
        }
      },
    );
  };
}

function sendRefreshError(reply: FastifyReply, error: unknown) {
  return error instanceof Error && !(error instanceof AuthError)
    ? reply.code(400).send({ message: error.message })
    : sendUserDataError(reply, error);
}
