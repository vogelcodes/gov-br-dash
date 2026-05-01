import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService, PublicUser } from "../services/auth.js";
import { getSessionToken } from "./auth.js";
import type { UserUasgService } from "../services/user-uasgs.js";
import type { UserDataSyncService } from "../services/user-data-sync.js";

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const bodySchema = z.object({
  codigoUasg: z
    .string()
    .min(1)
    .transform(onlyDigits)
    .refine((value) => value.length === 6, "codigoUasg must contain 6 digits"),
});

const paramsSchema = z.object({
  codigoUasg: z
    .string()
    .min(1)
    .transform(onlyDigits)
    .refine((value) => value.length === 6, "codigoUasg must contain 6 digits"),
});

interface MeUasgsRouteDeps {
  auth: AuthService;
  service: UserUasgService;
  sync: UserDataSyncService;
}

export function createMeUasgsRoutes(deps: MeUasgsRouteDeps) {
  return async function meUasgsRoutes(fastify: FastifyInstance) {
    async function requireUser(
      request: FastifyRequest,
      reply: FastifyInstance["server"],
    ) {
      void reply;
      return deps.auth.getUserForSession(getSessionToken(request));
    }

    fastify.get("/api/me/uasgs", async (request, reply) => {
      const user = await requireUser(request, fastify.server);
      if (!user) {
        return reply.code(401).send({ message: "Authentication required" });
      }
      const uasgs = deps.service.list(user.id);
      return reply.code(200).send({ uasgs });
    });

    fastify.post<{ Body: unknown }>("/api/me/uasgs", async (request, reply) => {
      const user = await requireAuthenticatedUser(deps.auth, request, reply);
      if (!user) {
        return undefined;
      }
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Invalid request body",
          errors: parsed.error.flatten(),
        });
      }

      try {
        const linked = await deps.service.link(user.id, parsed.data.codigoUasg);
        deps.sync.syncUasg(parsed.data.codigoUasg).catch((err: unknown) => {
          request.log.error({ err }, "Background UASG sync failed");
        });
        return reply.code(201).send({ uasg: linked });
      } catch (error) {
        return mapServiceError(error, reply);
      }
    });

    fastify.post<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg/sync",
      async (request, reply) => {
        const user = await requireAuthenticatedUser(deps.auth, request, reply);
        if (!user) {
          return undefined;
        }
        const parsed = paramsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: parsed.error.flatten(),
          });
        }
        try {
          const sync = await deps.sync.syncUasgForUser(
            user.id,
            parsed.data.codigoUasg,
          );
          return reply.code(200).send({ sync });
        } catch (error) {
          return mapServiceError(error, reply);
        }
      },
    );

    fastify.delete<{ Params: unknown }>(
      "/api/me/uasgs/:codigoUasg",
      async (request, reply) => {
        const user = await requireAuthenticatedUser(deps.auth, request, reply);
        if (!user) {
          return undefined;
        }
        const parsed = paramsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: parsed.error.flatten(),
          });
        }
        deps.service.unlink(user.id, parsed.data.codigoUasg);
        return reply.code(204).send();
      },
    );
  };
}

async function requireAuthenticatedUser(
  auth: AuthService,
  request: FastifyRequest,
  reply: {
    code: (statusCode: number) => { send: (payload: unknown) => unknown };
  },
): Promise<PublicUser | null> {
  const user = auth.getUserForSession(getSessionToken(request));
  if (!user) {
    reply.code(401).send({ message: "Authentication required" });
    return null;
  }
  return user;
}

function mapServiceError(
  error: unknown,
  reply: {
    code: (statusCode: number) => { send: (payload: unknown) => unknown };
  },
) {
  if (error instanceof Error && error.message === "UASG limit reached") {
    return reply.code(409).send({ message: error.message });
  }
  if (error instanceof Error && error.message === "UASG not found") {
    return reply.code(404).send({ message: error.message });
  }
  if (error instanceof Error && error.message === "UASG not linked to user") {
    return reply.code(404).send({ message: error.message });
  }
  if (error instanceof Error && error.message.includes("codigoUasg")) {
    return reply.code(400).send({ message: error.message });
  }
  throw error;
}
