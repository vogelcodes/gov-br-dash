import type { FastifyInstance } from "fastify";
import { z } from "zod";

const VersionResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  nodeVersion: z.string(),
  environment: z.enum(["development", "production", "test"]),
});

export async function versionRoute(fastify: FastifyInstance) {
  fastify.get("/version", async () => {
    return VersionResponseSchema.parse({
      name: "gov-br-dash",
      version: "0.0.1",
      description: "Serviço web para acesso a dados públicos do gov.br",
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? "development",
    });
  });
}
