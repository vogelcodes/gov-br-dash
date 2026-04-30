import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthError, type AuthService, type PublicUser } from "../services/auth.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export interface AuthenticatedRequest extends FastifyRequest {
  user: PublicUser;
  sessionToken: string;
}

interface AuthRouteDeps {
  authService: AuthService;
  secureCookies: boolean;
}

export function createAuthRoutes(deps: AuthRouteDeps) {
  return async function authRoutes(fastify: FastifyInstance) {
    const sendSession = (reply: FastifyReply, token: string, expiresAt: string) => {
      reply.setCookie("session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: deps.secureCookies,
        signed: true,
        path: "/",
        expires: new Date(expiresAt),
      });
    };

    fastify.post<{ Body: unknown }>("/api/auth/signup", async (request, reply) => {
      const body = credentialsSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid request body", errors: body.error.flatten() });
      }
      try {
        const result = await deps.authService.signup(body.data.email, body.data.password);
        sendSession(reply, result.sessionToken, result.expiresAt);
        return reply.code(201).send({ user: result.user });
      } catch (error) {
        return sendAuthError(reply, error);
      }
    });

    fastify.post<{ Body: unknown }>("/api/auth/login", async (request, reply) => {
      const body = credentialsSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ message: "Invalid request body", errors: body.error.flatten() });
      }
      try {
        const result = await deps.authService.login(body.data.email, body.data.password);
        sendSession(reply, result.sessionToken, result.expiresAt);
        return reply.code(200).send({ user: result.user });
      } catch (error) {
        return sendAuthError(reply, error);
      }
    });

    fastify.post("/api/auth/logout", async (request, reply) => {
      const token = getSessionToken(request);
      if (token) {
        deps.authService.logout(token);
      }
      reply.clearCookie("session", { path: "/" });
      return reply.code(204).send();
    });

    fastify.get("/api/auth/me", async (request, reply) => {
      const user = deps.authService.getUserForSession(getSessionToken(request));
      if (!user) {
        return reply.code(401).send({ message: "Authentication required" });
      }
      return reply.code(200).send({ user });
    });
  };
}

export function authenticate(authService: AuthService) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = getSessionToken(request);
    const user = authService.getUserForSession(token);
    if (!token || !user) {
      await reply.code(401).send({ message: "Authentication required" });
      return;
    }
    (request as AuthenticatedRequest).user = user;
    (request as AuthenticatedRequest).sessionToken = token;
  };
}

export function getSessionToken(request: FastifyRequest): string | undefined {
  const signed = request.unsignCookie(request.cookies.session ?? "");
  return signed.valid ? signed.value : undefined;
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }
  return reply.code(500).send({ message: "Authentication failed" });
}
