import type { RequestHandler } from "express";
import { invalidSession } from "../http/errors.js";
import type { AuthService } from "../services/auth.js";

export function requireAuthentication(auth: AuthService): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.get("Authorization") ?? "";
    const bearer = /^Bearer ([a-zA-Z0-9_.-]{1,2048})$/i.exec(authorization);
    if (!bearer) throw invalidSession();

    response.locals.user = await auth.authenticate(bearer[1]);
    next();
  };
}
