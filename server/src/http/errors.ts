import type { ErrorRequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: string[],
  ) {
    super(message);
  }
}

export function invalidSession() {
  return new ApiError(401, "INVALID_SESSION", "Sessão inválida ou expirada.");
}

export const handleApiError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, fields: error.fields },
    });
    return;
  }

  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({ error: { code: "INVALID_JSON", message: "Envie um JSON válido." } });
      return;
    }
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Solicitação muito grande." } });
      return;
    }
  }

  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno." } });
};
