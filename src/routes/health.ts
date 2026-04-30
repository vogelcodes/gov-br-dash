import type { FastifyInstance } from "fastify";
import { z } from "zod";

const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  timestamp: z.string().datetime(),
  uptime: z.number().positive(),
});

export async function healthRoute(fastify: FastifyInstance) {
  const startTime = Date.now();

  fastify.get("/health", async () => {
    return HealthResponseSchema.parse({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - startTime) / 1000,
    });
  });
}
