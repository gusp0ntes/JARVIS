import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestApi } from "./support/api.mjs";

test("health verifica o MongoDB isolado e sinaliza uma indisponibilidade real", { timeout: 180_000 }, async (context) => {
  const { mongo, connection, origin, close } = await startTestApi();
  context.after(close);
  assert.equal(connection.name, "jarvis_test");

  const healthy = await fetch(`${origin}/api/v1/health`);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { data: { status: "ok" } });
  assert.equal(healthy.headers.get("cache-control"), "no-store");
  assert.equal(healthy.headers.get("x-content-type-options"), "nosniff");
  assert.equal(healthy.headers.get("x-powered-by"), null);

  const unknownRoute = await fetch(`${origin}/api/v1/unknown`);
  assert.equal(unknownRoute.status, 404);
  assert.equal((await unknownRoute.json()).error.code, "NOT_FOUND");

  await mongo.stop();
  const unhealthy = await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(unhealthy.status, 503);
  assert.deepEqual(await unhealthy.json(), {
    error: { code: "SERVICE_UNAVAILABLE", message: "Serviço temporariamente indisponível." },
  });
});
