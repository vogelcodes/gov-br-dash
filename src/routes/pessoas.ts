import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { PortalApiError } from "../clients/portal-transparencia.js";
import type { PessoasService } from "../services/pessoas.js";

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const pessoaJuridicaQuerySchema = z.object({
  cnpj: z
    .string()
    .min(1)
    .transform(onlyDigits)
    .refine((value) => value.length === 14, {
      message: "cnpj must contain 14 digits",
    }),
});

const pessoaFisicaQuerySchema = z
  .object({
    cpf: z.string().optional(),
    nis: z.string().optional(),
  })
  .transform((value) => ({
    cpf: value.cpf ? onlyDigits(value.cpf) : undefined,
    nis: value.nis ? onlyDigits(value.nis) : undefined,
  }))
  .superRefine((value, context) => {
    if (!value.cpf && !value.nis) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "either cpf or nis must be provided",
      });
    }

    if (value.cpf && value.cpf.length !== 11) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cpf must contain 11 digits",
      });
    }

    if (value.nis && value.nis.length !== 11) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "nis must contain 11 digits",
      });
    }
  });

interface PessoasRouteDeps {
  service: PessoasService;
}

function handleGatewayError(reply: FastifyReply, error: unknown) {
  if (error instanceof PortalApiError) {
    return reply.code(error.statusCode).send({
      message: error.message,
    });
  }

  return reply.code(502).send({
    message: "Failed to query Portal da Transparência",
  });
}

export function createPessoasRoute(deps: PessoasRouteDeps) {
  return async function pessoasRoute(fastify: FastifyInstance) {
    fastify.get<{ Querystring: unknown }>(
      "/api/pessoas/juridica",
      async (request, reply) => {
        const query = pessoaJuridicaQuerySchema.safeParse(request.query);

        if (!query.success) {
          return reply.code(400).send({
            message: "Invalid query parameters",
            errors: query.error.flatten(),
          });
        }

        try {
          const result = await deps.service.consultarPessoaJuridica(
            query.data.cnpj,
          );
          return reply.code(200).send(result);
        } catch (error) {
          return handleGatewayError(reply, error);
        }
      },
    );

    fastify.get<{ Querystring: unknown }>(
      "/api/pessoas/fisica",
      async (request, reply) => {
        const query = pessoaFisicaQuerySchema.safeParse(request.query);

        if (!query.success) {
          return reply.code(400).send({
            message: "Invalid query parameters",
            errors: query.error.flatten(),
          });
        }

        try {
          const result = await deps.service.consultarPessoaFisica(query.data);
          return reply.code(200).send(result);
        } catch (error) {
          return handleGatewayError(reply, error);
        }
      },
    );
  };
}
