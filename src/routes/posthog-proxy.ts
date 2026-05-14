import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = "https://us-assets.i.posthog.com";

async function proxy(
  target: string,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const upstreamUrl = `${target}${request.url.replace(/^\/ingest/, "")}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        "content-type": request.headers["content-type"] ?? "application/json",
        "user-agent": request.headers["user-agent"] ?? "",
      },
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? JSON.stringify(request.body)
          : undefined,
    });
    reply.code(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) reply.header("content-type", ct);
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return reply.code(502).send({ message: "PostHog proxy unavailable" });
  }
}

export async function posthogProxyRoute(fastify: FastifyInstance) {
  fastify.all("/ingest/static/*", (req, rep) =>
    proxy(POSTHOG_ASSETS_HOST, req, rep),
  );
  fastify.all("/ingest/*", (req, rep) => proxy(POSTHOG_HOST, req, rep));
}
