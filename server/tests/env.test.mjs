import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "../dist/config/env.js";

const localEnv = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/jarvis_test",
  JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
};

test("valida a configuração e converte os prazos em valores numéricos", () => {
  const config = loadEnvironment(localEnv);
  assert.equal(config.NODE_ENV, "development");
  assert.equal(config.HOST, "127.0.0.1");
  assert.equal(config.PORT, 3001);
  assert.equal(config.ACCESS_TOKEN_TTL, 900);
  assert.equal(config.REFRESH_TOKEN_TTL_DAYS, 30);
  assert.equal(loadEnvironment({ ...localEnv, PORT: "8080", ACCESS_TOKEN_TTL: "30s" }).PORT, 8080);
  assert.equal(loadEnvironment({ ...localEnv, ACCESS_TOKEN_TTL: "30s" }).ACCESS_TOKEN_TTL, 30);
  const srvUri = "mongodb+srv://atlas.example.test/jarvis";
  assert.equal(loadEnvironment({ ...localEnv, MONGODB_URI: srvUri }).MONGODB_URI, srvUri);
});

test("rejeita configuração ausente, TTL inválido e opções inseguras de TLS", () => {
  assert.throws(() => loadEnvironment({}), /MONGODB_URI, JWT_ACCESS_SECRET/);
  assert.throws(() => loadEnvironment({ ...localEnv, ACCESS_TOKEN_TTL: "2h" }), /ACCESS_TOKEN_TTL/);
  assert.throws(() => loadEnvironment({ ...localEnv, REFRESH_TOKEN_TTL_DAYS: "0", PORT: "65536" }), /PORT, REFRESH_TOKEN_TTL_DAYS/);
  assert.throws(() => loadEnvironment({ ...localEnv, MONGODB_URI: "mongodb+srv://atlas.example.test/jarvis?tls=false" }), /MONGODB_URI/);
  assert.throws(() => loadEnvironment({ ...localEnv, MONGODB_URI: `${localEnv.MONGODB_URI}?tlsAllowInvalidCertificates=true` }), /MONGODB_URI/);
});

test("exige TLS explícito para URIs mongodb comuns em produção", () => {
  const production = { ...localEnv, NODE_ENV: "production" };
  assert.throws(() => loadEnvironment(production), /MONGODB_URI/);
  assert.throws(() => loadEnvironment({ ...production, MONGODB_URI: `${localEnv.MONGODB_URI}?tls=false` }), /MONGODB_URI/);
  assert.equal(loadEnvironment({ ...production, MONGODB_URI: `${localEnv.MONGODB_URI}?tls=true` }).NODE_ENV, "production");
  assert.equal(loadEnvironment({ ...production, MONGODB_URI: "mongodb+srv://atlas.example.test/jarvis" }).NODE_ENV, "production");
});

test("o processo falha na inicialização e informa apenas os nomes das variáveis inválidas", () => {
  const invalidUri = "invalid-connection-value-that-must-not-appear";
  const invalidSecret = "non-loggable-test-value";
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/server.js", import.meta.url))], {
    env: { ...process.env, NODE_ENV: "test", MONGODB_URI: invalidUri, JWT_ACCESS_SECRET: invalidSecret },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MONGODB_URI, JWT_ACCESS_SECRET/);
  assert.ok(!result.stderr.includes(invalidUri));
  assert.ok(!result.stderr.includes(invalidSecret));
  assert.doesNotMatch(result.stdout, /disponível/);
});
