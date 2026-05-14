import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { SqlitePortalDataRepository } from "../db/portal-data-repository.js";
import {
  BG_PRIORITY_RED,
  BG_PRIORITY_YELLOW,
  type SqliteSyncJobRepository,
} from "../db/sync-job-repository.js";
import type { SqliteSyncRepository } from "../db/sync-repository.js";
import { AuthError, type AuthService } from "../services/auth.js";
import type { PortalDataSyncService } from "../services/portal-data-sync.js";
import { staleness } from "../services/staleness.js";
import {
  renderArpExport,
  renderUasgExport,
  type ArpExportFormat,
} from "../exports/index.js";
import { authenticate, type AuthenticatedRequest } from "./auth.js";
import { sendUserDataError } from "./user-uasgs.js";

const arpParamsSchema = z.object({ numeroControlePncpAta: z.string().min(1) });
const uasgParamsSchema = z.object({ codigoUasg: z.string().min(1) });
const cnpjParamsSchema = z.object({
  cnpj: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 14, "cnpj must contain 14 digits"),
});
const arpExportParamsSchema = arpParamsSchema.extend({
  format: z.enum(["csv", "xlsx"]),
});
const uasgExportParamsSchema = uasgParamsSchema.extend({
  format: z.enum(["csv", "xlsx"]),
});

interface PortalSyncRouteDeps {
  authService: AuthService;
  syncRepository: SqliteSyncRepository;
  portalRepository: SqlitePortalDataRepository;
  jobRepository: SqliteSyncJobRepository;
  portalSyncService: PortalDataSyncService;
}

const documentoParamsSchema = z.object({ documento: z.string().min(1) });

export function createPortalSyncRoutes(deps: PortalSyncRouteDeps) {
  return async function portalSyncRoutes(fastify: FastifyInstance) {
    fastify.addHook("preHandler", authenticate(deps.authService));

    fastify.post<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/portal-sync",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const active = deps.jobRepository.findActiveForArp(
            user.id,
            params.data.numeroControlePncpAta,
          );
          if (active) {
            return reply
              .code(409)
              .send({ message: "Portal sync already in progress", job: active });
          }
          const arp = deps.syncRepository.findArp(params.data.numeroControlePncpAta);
          if (!arp) {
            return reply.code(404).send({ message: "ARP not found" });
          }
          const job = deps.jobRepository.enqueuePortalSupplierArp(
            user.id,
            arp.codigoUasg,
            params.data.numeroControlePncpAta,
          );
          return reply.code(202).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/portal-sync-status",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const job =
            deps.jobRepository.findActiveForArp(
              user.id,
              params.data.numeroControlePncpAta,
            ) ??
            deps.jobRepository.findLatestForArp(
              user.id,
              params.data.numeroControlePncpAta,
            );
          return reply.code(200).send({ job });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/portal-empenhos",
      async (request, reply) => {
        const params = arpParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const empenhos = deps.portalRepository.listEmpenhosByArp(
            params.data.numeroControlePncpAta,
          );
          const contratos = deps.portalRepository.listContratosByArp(
            params.data.numeroControlePncpAta,
          );
          return reply.code(200).send({ empenhos, contratos });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.post<{ Params: unknown }>(
      "/api/me/suppliers/:cnpj/portal-sync",
      async (request, reply) => {
        const params = cnpjParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (
            !deps.syncRepository.userOwnsPessoaJuridica(user.id, params.data.cnpj)
          ) {
            return reply.code(404).send({ message: "Supplier not found for user" });
          }
          // Synchronous supplier sync. Skips per-empenho detail fan-out
          // (itens/historico/relacionados) so the button returns within
          // ~15s for a typical supplier; details are lazy-fetched per
          // empenho when the user expands a row.
          const result = await deps.portalSyncService.syncSupplier(
            params.data.cnpj,
            {
              includeDetails: false,
              includeContratos: true,
              includeSancoes: true,
            },
          );
          return reply.code(200).send({ result });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/empenhos/:documento/portal-detail",
      async (request, reply) => {
        const params = documentoParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const cnpj = deps.portalRepository.findEmpenhoCnpj(
            params.data.documento,
          );
          const user = (request as AuthenticatedRequest).user;
          if (
            !cnpj ||
            !deps.syncRepository.userOwnsPessoaJuridica(user.id, cnpj)
          ) {
            return reply.code(404).send({ message: "Empenho not found" });
          }
          let bundle = deps.portalRepository.findEmpenhoBundle(
            params.data.documento,
          );
          if (!bundle) {
            return reply.code(404).send({ message: "Empenho not found" });
          }
          // Lazy-fetch detail/itens/historico/relacionados from the Portal
          // on first expand. Subsequent expands hit the DB only.
          if (
            bundle.detail === null &&
            bundle.itens.length === 0 &&
            bundle.relacionados.length === 0
          ) {
            await deps.portalSyncService.ensureEmpenhoDetail(
              params.data.documento,
            );
            bundle =
              deps.portalRepository.findEmpenhoBundle(params.data.documento) ??
              bundle;
          }
          return reply.code(200).send({ bundle });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/suppliers/:cnpj/portal-summary",
      async (request, reply) => {
        const params = cnpjParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsPessoaJuridica(user.id, params.data.cnpj)) {
            return reply.code(404).send({ message: "Supplier not found for user" });
          }
          const empenhos = deps.portalRepository.listEmpenhosByCnpj(params.data.cnpj);
          const contratos = deps.portalRepository.listContratosByCnpj(params.data.cnpj);
          const sancoes = deps.portalRepository.listSancoesByCnpj(params.data.cnpj);
          const pessoa = deps.syncRepository.findPessoaJuridica(params.data.cnpj);
          const level = staleness(pessoa?.lastSyncedAt, "supplier");
          if (level !== "fresh") {
            const codigoUasg = deps.syncRepository.findUserUasgForSupplier(
              user.id,
              params.data.cnpj,
            );
            if (codigoUasg) {
              try {
                deps.jobRepository.enqueueBgRefreshSupplier(
                  user.id,
                  codigoUasg,
                  params.data.cnpj,
                  level === "red" ? BG_PRIORITY_RED : BG_PRIORITY_YELLOW,
                );
              } catch (err) {
                request.log.warn(
                  { err, cnpj: params.data.cnpj },
                  "failed to enqueue bg-refresh-supplier",
                );
              }
            }
          }
          return reply.code(200).send({ pessoa, empenhos, contratos, sancoes });
        } catch (error) {
          return sendUserDataError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/export.:format",
      async (request, reply) => {
        const params = uasgExportParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsUasg(user.id, params.data.codigoUasg)) {
            return reply.code(404).send({ message: "UASG not found for user" });
          }
          const result = await renderUasgExport({
            codigoUasg: params.data.codigoUasg,
            format: params.data.format as ArpExportFormat,
            syncRepo: deps.syncRepository,
            portalRepo: deps.portalRepository,
          });
          return reply
            .code(200)
            .header("Content-Type", result.contentType)
            .header(
              "Content-Disposition",
              `attachment; filename="${result.filename}"`,
            )
            .send(result.buffer);
        } catch (error) {
          return sendExportError(reply, error);
        }
      },
    );

    fastify.get<{ Params: unknown }>(
      "/api/me/arps/:numeroControlePncpAta/export.:format",
      async (request, reply) => {
        const params = arpExportParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }
        try {
          const user = (request as AuthenticatedRequest).user;
          if (!deps.syncRepository.userOwnsArp(user.id, params.data.numeroControlePncpAta)) {
            return reply.code(404).send({ message: "ARP not found for user" });
          }
          const result = await renderArpExport({
            numeroControlePncpAta: params.data.numeroControlePncpAta,
            format: params.data.format as ArpExportFormat,
            syncRepo: deps.syncRepository,
            portalRepo: deps.portalRepository,
          });
          return reply
            .code(200)
            .header("Content-Type", result.contentType)
            .header(
              "Content-Disposition",
              `attachment; filename="${result.filename}"`,
            )
            .send(result.buffer);
        } catch (error) {
          return sendExportError(reply, error);
        }
      },
    );
  };
}

function sendExportError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }
  if (error instanceof Error) {
    return reply.code(500).send({ message: error.message });
  }
  return reply.code(500).send({ message: "Export failed" });
}

