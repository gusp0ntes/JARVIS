import type { z } from "zod";
import { ApiError } from "./errors.js";

export function parseBody<Schema extends z.ZodType>(schema: Schema, body: unknown): z.output<Schema> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields = [...new Set(result.error.issues.flatMap(({ path }) =>
    typeof path[0] === "string" ? [path[0]] : []
  ))];
  throw new ApiError(400, "VALIDATION_ERROR", "Confira os campos enviados.", fields);
}
