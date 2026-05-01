import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ComprasGovApiError } from "../clients/compras-gov.js";
import type { ArpsService } from "../services/arps.js";
import type { UserDataSyncService } from "../services/user-data-sync.js";

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const uasgParamsSchema = z.object({
  codigoUasg: z
    .string()
    .min(1)
    .transform(onlyDigits)
    .refine((value) => value.length === 6, {
      message: "codigoUasg must contain 6 digits",
    }),
});

interface ArpsRouteDeps {
  service: ArpsService;
  syncService: UserDataSyncService;
}

function handleGatewayError(reply: FastifyReply, error: unknown) {
  if (error instanceof ComprasGovApiError) {
    return reply.code(error.statusCode).send({
      message: error.message,
    });
  }

  return reply.code(502).send({
    message: "Failed to query Compras.gov.br",
  });
}

export function createArpsRoute(deps: ArpsRouteDeps) {
  return async function arpsRoute(fastify: FastifyInstance) {
    fastify.get<{ Params: unknown }>(
      "/api/arps/uasg/:codigoUasg",
      async (request, reply) => {
        const params = uasgParamsSchema.safeParse(request.params);

        if (!params.success) {
          return reply.code(400).send({
            message: "Invalid route parameters",
            errors: params.error.flatten(),
          });
        }

        try {
          const resultado = await deps.service.consultarArpsPorUasg(
            params.data.codigoUasg,
          );

          deps.syncService
            .syncItemsForArps(params.data.codigoUasg, resultado)
            .catch((err: unknown) => {
              request.log.error({ err }, "Background item sync failed");
            });

          return reply.code(200).send({ resultado });
        } catch (error) {
          return handleGatewayError(reply, error);
        }
      },
    );
  };
}
