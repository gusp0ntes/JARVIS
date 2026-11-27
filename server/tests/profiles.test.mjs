import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startTestApi } from "./support/api.mjs";

const message = { title: "", message: "" };
const profile = {
  schemaVersion: 1, name: "Trabalho", description: "Rotina noturna",
  theme: { mode: "gradient", primaryColor: "#ffffff", secondaryColor: "#38bdf8" },
  applications: [{ kind: "executable", executable: "Editor.exe" }],
  browser: { enabled: true, id: "edge", urls: ["https://example.test/guia", "https://example.test/docs"] },
  vpnEnabled: true,
  routine: { enabled: true, breakEnabled: true, schedule: { start: "22:00", lunchStart: "01:00", lunchEnd: "02:00", end: "06:00" } },
  notifications: { enabled: true, sound: true, duration: 5, messages: { start: message, lunchStart: message, lunchEnd: message, end: message } },
};
const password = "senha longa de teste isolado";
let api;
let first;
let second;

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${api.origin}/api/v1${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status, ...(await response.json()) };
}

async function newUser(email) {
  const registered = await request("/auth/register", { method: "POST", body: { name: "Conta de teste", email, password, passwordConfirmation: password } });
  assert.equal(registered.status, 201);
  const logged = await request("/auth/login", { method: "POST", body: { email, password } });
  assert.equal(logged.status, 200);
  return logged.data;
}

before(async () => {
  api = await startTestApi();
  first = await newUser("first-profile@example.test");
  second = await newUser("second-profile@example.test");
}, { timeout: 180_000 });
after(async () => { await api?.close(); });

const path = "/profiles/me";
const save = (token, expectedRevision, value = profile) => request(path, { method: "PUT", token, body: { expectedRevision, profile: value } });

test("profile endpoints require a session and obtain the owner from the verified account", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request(path, { method })).status, 401);
  const empty = await request(path, { token: first.accessToken });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data, { profile: null, revision: 0, updatedAt: null });
  const spoof = await request(path, { method: "PUT", token: first.accessToken, body: { userId: second.user.id, expectedRevision: 0, profile } });
  assert.equal(spoof.status, 400);
});

test("rejects absolute paths, VPN identifiers and sensitive URLs in HTTP payloads", async () => {
  for (const value of [
    { ...profile, vpnName: "rede-local" },
    { ...profile, vpn: { name: "rede-local", server: "10.0.0.1" } },
    { ...profile, applications: [{ kind: "executable", executable: "C:\\Programs\\Editor.exe" }] },
    { ...profile, browser: { ...profile.browser, urls: ["https://example.test/?token=private"] } },
  ]) assert.equal((await save(first.accessToken, 0, value)).status, 400);
  assert.equal((await api.connection.db.collection("profiles").countDocuments()), 0);
});

test("creates and returns one profile per owner while protecting concurrent revisions", async () => {
  const initial = await Promise.all([save(first.accessToken, 0), save(first.accessToken, 0)]);
  assert.deepEqual(initial.map(({ status }) => status).sort(), [200, 409]);
  const firstSaved = initial.find(({ status }) => status === 200).data;
  assert.deepEqual(firstSaved.profile, profile);
  assert.equal(firstSaved.revision, 1);

  const isolated = await request(`${path}?userId=${first.user.id}`, { token: second.accessToken });
  assert.equal(isolated.data.profile, null);
  assert.equal((await save(second.accessToken, 1)).status, 409);
  assert.equal((await save(second.accessToken, 0, { ...profile, name: "Outro perfil" })).status, 200);

  const competing = await Promise.all([
    save(first.accessToken, 1, { ...profile, name: "Versão A" }),
    save(first.accessToken, 1, { ...profile, name: "Versão B" }),
  ]);
  assert.deepEqual(competing.map(({ status }) => status).sort(), [200, 409]);
  const saved = competing.find(({ status }) => status === 200).data;
  assert.equal(saved.revision, 2);
  assert.deepEqual((await request(path, { token: first.accessToken })).data, saved);
  assert.equal((await request(path, { token: second.accessToken })).data.profile.name, "Outro perfil");
});

test("deletion checks revision, removes cloud data and prevents stale writes after recreation", async () => {
  const remove = (expectedRevision) => request(path, { method: "DELETE", token: first.accessToken, body: { expectedRevision } });
  assert.equal((await remove(1)).status, 409);
  const deleted = await remove(2);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.profile, null);
  assert.equal(deleted.data.revision, 3);
  assert.equal(await api.connection.db.collection("profiles").countDocuments({ profile: { $exists: true } }), 1);
  assert.equal((await save(first.accessToken, 0)).status, 409);
  assert.equal((await save(first.accessToken, 2)).status, 409);
  assert.equal((await save(first.accessToken, 3)).data.revision, 4);
});

test("account updates apply to the current user and require the current password for an email change", async () => {
  const patch = (body) => request("/users/me", { method: "PATCH", token: first.accessToken, body });
  assert.equal((await patch({ name: "Atualizado", userId: second.user.id })).status, 400);
  assert.equal((await patch({ email: "new-profile@example.test" })).status, 400);
  assert.equal((await patch({ email: "new-profile@example.test", currentPassword: "senha incorreta" })).status, 401);
  assert.equal((await patch({ email: second.user.email, currentPassword: password })).status, 409);
  assert.equal((await patch({ name: "Atualizado" })).data.name, "Atualizado");
  const updated = await patch({ email: " NEW-PROFILE@EXAMPLE.TEST ", currentPassword: password });
  assert.deepEqual(updated.data, { id: first.user.id, name: "Atualizado", email: "new-profile@example.test" });
  assert.deepEqual((await request("/users/me", { token: second.accessToken })).data, second.user);
});
