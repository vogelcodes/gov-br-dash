import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { AuthError, type AuthService } from "../services/auth.js";
import type { UserUasgService } from "../services/user-uasgs.js";
import type { UserDataSyncService } from "../services/user-data-sync.js";
import { authenticate, type AuthenticatedRequest } from "./auth.js";

const linkBodySchema = z.object({ codigoUasg: z.string().min(1) });
const uasgParamsSchema = z.object({ codigoUasg: z.string().min(1) });

interface UserUasgRouteDeps {
  authService: AuthService;
  userUasgService: UserUasgService;
  syncService: UserDataSyncService;
}

export function createUserUasgRoutes(deps: UserUasgRouteDeps) {
  return async function userUasgRoutes(fastify: FastifyInstance) {
    fastify.addHook("preHandler", authenticate(deps.authService));

    fastify.get("/api/me/uasgs", async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      return reply.code(200).send({ uasgs: deps.userUasgService.list(user.id) });
    });

    fastify.post<{ Body: unknown }>("/api/me/uasgs", async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const body = linkBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid request body", errors: body.error.flatten() });
      }
      try {
        const uasg = await deps.userUasgService.link(user.id, body.data.codigoUasg);
        deps.syncService.syncUasg(uasg.codigoUasg).catch((err: unknown) => {
          request.log.error({ err }, "Background UASG sync failed");
        });
        return reply.code(201).send({ uasg });
      } catch (error) {
        return sendUserDataError(reply, error);
      }
    });

    fastify.delete<{ Params: unknown }>("/api/me/uasgs/:codigoUasg", async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const params = uasgParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Invalid route parameters", errors: params.error.flatten() });
      }
      const removed = deps.userUasgService.unlink(user.id, params.data.codigoUasg);
      return removed ? reply.code(204).send() : reply.code(404).send({ message: "Linked UASG not found" });
    });
  };
}

export function sendUserDataError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }
  return reply.code(502).send({ message: "Failed to process user data" });
}
