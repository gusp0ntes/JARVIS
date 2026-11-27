import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { decodeJwt, SignJWT } from "jose";
import { startTestApi } from "./support/api.mjs";

const email = "jarvis@example.test";
const password = " frase longa ágil 🔒 ";
const registration = { name: "Pessoa Teste", email, password, passwordConfirmation: password };
const credentials = { email, password };
let api;

before(async () => { api = await startTestApi(); }, { timeout: 180_000 });
after(async () => { await api?.close(); });

async function request(path, { body, accessToken, origin = api.origin } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: response.status === 204 ? undefined : await response.json(),
  };
}

async function login(body = credentials) {
  const result = await request("/auth/login", { body });
  assert.equal(result.status, 200);
  return result.body.data;
}

function refresh(refreshToken) {
  return request("/auth/refresh", { body: { refreshToken } });
}

function me(accessToken) {
  return request("/users/me", { accessToken });
}

function logout(refreshToken) {
  return request("/auth/logout", { body: { refreshToken } });
}

test("cadastro normaliza e-mail, protege a senha e rejeita e-mail duplicado", async () => {
  const body = { ...registration, email: "  JARVIS@EXAMPLE.TEST  " };
  const results = await Promise.all([
    request("/auth/register", { body }),
    request("/auth/register", { body: registration }),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
  const { data } = results.find(({ status }) => status === 201).body;
  assert.deepEqual(data, { id: data.id, name: registration.name, email });
  assert.equal(results.find(({ status }) => status === 409).body.error.code, "REGISTRATION_UNAVAILABLE");

  const users = api.connection.db.collection("users");
  const stored = await users.findOne({ email });
  assert.equal(await users.countDocuments({ email }), 1);
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  assert.notEqual(stored.passwordHash, password);
  assert.equal(stored.password, undefined);
  assert.equal(stored.passwordConfirmation, undefined);
});

test("cadastro valida confirmação de senha, campos extras e tamanho máximo", async () => {
  const mismatch = await request("/auth/register", { body: { ...registration, passwordConfirmation: "valor diferente" } });
  assert.equal(mismatch.status, 400);
  assert.deepEqual(mismatch.body.error.fields, ["passwordConfirmation"]);

  const extra = await request("/auth/register", { body: { ...registration, userId: "other" } });
  assert.equal(extra.status, 400);

  const long = "🔒".repeat(129);
  const invalidLength = await request("/auth/register", { body: { ...registration, password: long, passwordConfirmation: long } });
  assert.equal(invalidLength.status, 400);
  assert.ok(invalidLength.body.error.fields.includes("password"));
});

test("login tem resposta genérica para senha incorreta e conta inexistente", async () => {
  const wrongPassword = await request("/auth/login", { body: { email, password: password.trim() } });
  const unknownAccount = await request("/auth/login", { body: { email: "unknown@example.test", password } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownAccount.status, 401);
  assert.deepEqual(wrongPassword.body, unknownAccount.body);
  assert.equal(wrongPassword.body.error.code, "INVALID_CREDENTIALS");
});

test("login inicia sessão e persiste apenas o hash do refresh token", async () => {
  const session = await login({ email: " JARVIS@EXAMPLE.TEST ", password });
  assert.equal(session.user.email, email);
  assert.equal(session.accessTokenExpiresIn, 900);
  const claims = decodeJwt(session.accessToken);
  assert.equal(claims.sub, session.user.id);
  assert.equal(claims.exp - claims.iat, 900);
  const sessions = api.connection.db.collection("sessions");
  const stored = await sessions.findOne({ tokenFamilyId: claims.sid });
  assert.equal(stored.refreshTokenHash, createHash("sha256").update(session.refreshToken).digest("hex"));
  assert.equal(stored.refreshToken, undefined);
  const indexes = await sessions.indexes();
  assert.ok(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
  assert.deepEqual((await me(session.accessToken)).body, { data: session.user });
});

test("renovação rotaciona o token e o reuso revoga apenas a família correspondente", async () => {
  const first = await login();
  const independent = await login();
  const renewed = await refresh(first.refreshToken);
  assert.equal(renewed.status, 200);
  assert.notEqual(renewed.body.data.refreshToken, first.refreshToken);
  assert.notEqual(renewed.body.data.accessToken, first.accessToken);
  assert.equal((await me(renewed.body.data.accessToken)).status, 200);

  assert.equal((await refresh(first.refreshToken)).status, 401);
  assert.equal((await refresh(renewed.body.data.refreshToken)).status, 401);
  assert.equal((await me(renewed.body.data.accessToken)).status, 401);
  assert.equal((await me(independent.accessToken)).status, 200);
});

test("renovações concorrentes permitem uma única rotação e revogam o reuso", async () => {
  const original = await login();
  const results = await Promise.all([refresh(original.refreshToken), refresh(original.refreshToken)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 401]);
  const rotated = results.find(({ status }) => status === 200).body.data;
  assert.equal((await refresh(rotated.refreshToken)).status, 401);
  assert.equal((await me(original.accessToken)).status, 401);
});

test("refresh forjado ou com caracteres extras não revoga a sessão válida", async () => {
  const original = await login();
  const [familyId, nonce, signature] = original.refreshToken.split(".");
  const altered = `${familyId}.${nonce}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal((await refresh(altered)).status, 401);
  assert.equal((await refresh(`${original.refreshToken}\n`)).status, 401);
  assert.equal((await logout(altered)).status, 204);
  assert.equal((await refresh(original.refreshToken)).status, 200);
});

test("sessão expirada é recusada mesmo enquanto seu documento permanece no MongoDB", async () => {
  const original = await login();
  const tokenFamilyId = decodeJwt(original.accessToken).sid;
  const sessions = api.connection.db.collection("sessions");
  await sessions.updateOne({ tokenFamilyId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await refresh(original.refreshToken)).status, 401);
  assert.equal((await me(original.accessToken)).status, 401);
  assert.equal((await sessions.findOne({ tokenFamilyId })).revokedAt, null);
});

test("endpoint de conta recusa acesso ausente, inválido ou JWT expirado", async () => {
  assert.equal((await me()).status, 401);
  assert.equal((await me("invalid-token")).status, 401);

  const original = await login();
  const { sid, sub, iss, aud, iat } = decodeJwt(original.accessToken);
  const expiredJwt = await new SignJWT({ sid }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt(iat - 30).setExpirationTime(iat - 1)
    .sign(Buffer.from(api.config.JWT_ACCESS_SECRET));
  assert.equal((await me(expiredJwt)).status, 401);
  assert.equal((await me(original.accessToken)).status, 200);
});

test("logout é idempotente e bloqueia access e refresh da mesma sessão", async () => {
  const original = await login();
  assert.equal((await logout(original.refreshToken)).status, 204);
  assert.equal((await logout(original.refreshToken)).status, 204);
  assert.equal((await me(original.accessToken)).status, 401);
  assert.equal((await refresh(original.refreshToken)).status, 401);
});

test("duas contas recebem apenas seus dados, inclusive com senha de 128 caracteres", async () => {
  const secondary = { email: "another@example.test", password: "🔒".repeat(128) };
  const created = await request("/auth/register", {
    body: { ...registration, ...secondary, passwordConfirmation: secondary.password },
  });
  assert.equal(created.status, 201);
  const first = await login();
  const second = await login(secondary);
  assert.notEqual(first.user.id, second.user.id);
  assert.equal((await me(first.accessToken)).body.data.email, email);
  assert.equal((await me(second.accessToken)).body.data.email, secondary.email);
});

test("limita as tentativas de cadastro e login pelo mesmo endereço", async () => {
  let result;
  for (let attempt = 0; attempt < 21; attempt++) {
    result = await request("/auth/login", { body: {} });
    if (result.status === 429) break;
    assert.equal(result.status, 400);
  }
  assert.equal(result.status, 429);
  assert.equal(result.body.error.code, "RATE_LIMITED");
  assert.ok(Number(result.headers.get("retry-after")) > 0);
  const registrationLimit = await request("/auth/register", { body: registration });
  assert.equal(registrationLimit.status, 429);
  assert.equal((await request("/health")).status, 200);
});
