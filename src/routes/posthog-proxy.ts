import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = "https://us-assets.i.posthog.com";

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "upgrade",
]);

function forwardHeaders(src: FastifyRequest["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(",") : String(v);
  }
  return out;
}

async function proxy(
  target: string,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const upstreamUrl = `${target}${request.url.replace(/^\/ingest/, "")}`;
  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? (request.body as Buffer | undefined)
      : undefined;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders(request.headers),
      body,
    });
    reply.code(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) reply.header("content-type", ct);
    const ce = upstream.headers.get("content-encoding");
    if (ce) reply.header("content-encoding", ce);
    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return reply.code(502).send({ message: "PostHog proxy unavailable" });
  }
}

export async function posthogProxyRoute(fastify: FastifyInstance) {
  fastify.addContentTypeParser(
    /.*/,
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );
  fastify.all("/ingest/static/*", (req, rep) =>
    proxy(POSTHOG_ASSETS_HOST, req, rep),
  );
  fastify.all("/ingest/*", (req, rep) => proxy(POSTHOG_HOST, req, rep));
}
