import { json, Router } from "express";
import { parseBody } from "../http/parse-body.js";
import { requireAuthentication } from "../middlewares/auth.js";
import { profileDeleteSchema, profileWriteSchema } from "../schemas/profile.js";
import type { AuthService } from "../services/auth.js";
import type { ProfileService } from "../services/profiles.js";

export function createProfileRouter(auth: AuthService, profiles: ProfileService) {
  const router = Router();
  router.use(requireAuthentication(auth));
  const parseJson = json({ limit: "1mb" });

  router.get("/me", async (_request, response) => {
    response.json({ data: await profiles.get(response.locals.user.id) });
  });
  router.put("/me", parseJson, async (request, response) => {
    const { profile, expectedRevision } = parseBody(profileWriteSchema, request.body);
    response.json({ data: await profiles.save(response.locals.user.id, expectedRevision, profile) });
  });
  router.delete("/me", parseJson, async (request, response) => {
    const { expectedRevision } = parseBody(profileDeleteSchema, request.body);
    response.json({ data: await profiles.delete(response.locals.user.id, expectedRevision) });
  });

  return router;
}
