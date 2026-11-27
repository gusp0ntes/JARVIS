import { json, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ApiError } from "../http/errors.js";
import { parseBody } from "../http/parse-body.js";
import { requireAuthentication } from "../middlewares/auth.js";
import { accountUpdateSchema, loginSchema, refreshSchema, registrationSchema } from "../schemas/auth.js";
import type { AuthService } from "../services/auth.js";

function authenticationRateLimit(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new ApiError(429, "RATE_LIMITED", "Muitas solicitações. Aguarde e tente novamente."));
    },
  });
}

export function createAuthRouter(auth: AuthService) {
  const router = Router();
  const parseJson = json({ limit: "8kb" });
  const credentialsLimit = authenticationRateLimit(15 * 60_000, 20);
  const sessionsLimit = authenticationRateLimit(60_000, 60);

  router.post("/auth/register", credentialsLimit, parseJson, async (request, response) => {
    const data = await auth.register(parseBody(registrationSchema, request.body));
    response.status(201).json({ data });
  });

  router.post("/auth/login", credentialsLimit, parseJson, async (request, response) => {
    const data = await auth.login(parseBody(loginSchema, request.body));
    response.status(200).json({ data });
  });

  router.post("/auth/refresh", sessionsLimit, parseJson, async (request, response) => {
    const { refreshToken } = parseBody(refreshSchema, request.body);
    const data = await auth.refresh(refreshToken);
    response.status(200).json({ data });
  });

  router.post("/auth/logout", sessionsLimit, parseJson, async (request, response) => {
    const { refreshToken } = parseBody(refreshSchema, request.body);
    await auth.logout(refreshToken);
    response.status(204).end();
  });

  router.get("/users/me", requireAuthentication(auth), (_request, response) => {
    response.status(200).json({ data: response.locals.user });
  });
  router.patch("/users/me", requireAuthentication(auth), credentialsLimit, parseJson, async (request, response) => {
    const input = parseBody(accountUpdateSchema, request.body);
    response.json({ data: await auth.updateAccount(response.locals.user.id, input) });
  });

  return router;
}
