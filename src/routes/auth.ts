import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "@fastify/cookie";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";

const SESSION_COOKIE = "session";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

interface AuthRouteDeps {
  auth: AuthService;
  secureCookies: boolean;
}

export function getSessionToken(request: FastifyRequest): string | undefined {
  return request.cookies?.[SESSION_COOKIE];
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: string,
  secure: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function createAuthRoutes(deps: AuthRouteDeps) {
  return async function authRoutes(fastify: FastifyInstance) {
    fastify.post<{ Body: unknown }>(
      "/api/auth/signup",
      async (request, reply) => {
        const parsed = credentialsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply
            .code(400)
            .send({
              message: "Invalid request body",
              errors: parsed.error.flatten(),
            });
        }

        try {
          const user = await deps.auth.signup(
            parsed.data.email,
            parsed.data.password,
          );
          const session = await deps.auth.login(
            parsed.data.email,
            parsed.data.password,
          );
          setSessionCookie(
            reply,
            session.token,
            session.expiresAt,
            deps.secureCookies,
          );
          return reply.code(201).send({ user });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Email already registered"
          ) {
            return reply.code(409).send({ message: error.message });
          }
          throw error;
        }
      },
    );

    fastify.post<{ Body: unknown }>(
      "/api/auth/login",
      async (request, reply) => {
        const parsed = credentialsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply
            .code(400)
            .send({
              message: "Invalid request body",
              errors: parsed.error.flatten(),
            });
        }

        try {
          const session = await deps.auth.login(
            parsed.data.email,
            parsed.data.password,
          );
          setSessionCookie(
            reply,
            session.token,
            session.expiresAt,
            deps.secureCookies,
          );
          return reply.code(200).send({ user: session.user });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Invalid email or password"
          ) {
            return reply.code(401).send({ message: error.message });
          }
          throw error;
        }
      },
    );

    fastify.post("/api/auth/logout", async (request, reply) => {
      await deps.auth.logout(getSessionToken(request));
      clearSessionCookie(reply);
      return reply.code(204).send();
    });

    fastify.get("/api/auth/me", async (request, reply) => {
      const token = getSessionToken(request);
      if (!token) {
        return reply.code(401).send({ message: "Authentication required" });
      }

      const user = await deps.auth.authenticate(token);
      if (!user) {
        return reply.code(401).send({ message: "Authentication required" });
      }
      return reply.code(200).send({ user });
    });
  };
}
