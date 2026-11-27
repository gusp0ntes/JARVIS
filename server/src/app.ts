import express from "express";
import helmet from "helmet";
import type { Connection } from "mongoose";
import { pingDatabase } from "./config/database.js";
import { handleApiError } from "./http/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createProfileRouter } from "./routes/profiles.js";
import { createAuthService, type AuthConfig } from "./services/auth.js";
import { createProfileService } from "./services/profiles.js";

export async function createApp(connection: Connection, config: AuthConfig & { TRUST_PROXY_HOPS: number }) {
  const [auth, profiles] = await Promise.all([createAuthService(connection, config), createProfileService(connection)]);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/v1/health", async (_request, response) => {
    try {
      await pingDatabase(connection);
      response.status(200).json({ data: { status: "ok" } });
    } catch {
      response.status(503).json({
        error: { code: "SERVICE_UNAVAILABLE", message: "Serviço temporariamente indisponível." },
      });
    }
  });

  app.use("/api/v1", createAuthRouter(auth));
  app.use("/api/v1/profiles", createProfileRouter(auth, profiles));
  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } });
  });

  app.use(handleApiError);
  return app;
}
