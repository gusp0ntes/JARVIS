import assert from "node:assert/strict";
import { test } from "node:test";
import { portableProfileSchema, profileWriteSchema } from "../dist/schemas/profile.js";

const emptyMessage = { title: "", message: "" };
const profile = {
  schemaVersion: 1,
  name: "Trabalho",
  description: "Ambiente principal",
  theme: { mode: "gradient", primaryColor: "#ffffff", secondaryColor: "#38bdf8" },
  applications: [
    { kind: "packaged", appId: "MSTeams_8wekyb3d8bbwe!MSTeams" },
    { kind: "executable", executable: "Editor.exe", name: "Editor" },
  ],
  browser: { enabled: true, id: "edge", urls: ["https://example.test/guia/visão-geral", "http://intranet/"] },
  vpnEnabled: true,
  routine: { enabled: true, breakEnabled: true, schedule: { start: "22:00", lunchStart: "01:00", lunchEnd: "02:00", end: "06:00" } },
  notifications: {
    enabled: true,
    sound: false,
    duration: 5,
    messages: { start: emptyMessage, lunchStart: emptyMessage, lunchEnd: emptyMessage, end: emptyMessage },
  },
};

test("aceita tema existente, ordem das abas e horários noturnos", () => {
  assert.deepEqual(portableProfileSchema.parse(profile), profile);
  for (const expectedRevision of [0, 4]) {
    assert.deepEqual(profileWriteSchema.parse({ expectedRevision, profile }), { expectedRevision, profile });
  }
});

test("rejeita revisões e versões inválidas e identidade de conta enviada pelo cliente", () => {
  assert.equal(portableProfileSchema.safeParse({ ...profile, schemaVersion: 2 }).success, false);
  for (const expectedRevision of [-1, 0.5, "4"]) {
    assert.equal(profileWriteSchema.safeParse({ expectedRevision, profile }).success, false);
  }
  assert.equal(profileWriteSchema.safeParse({ expectedRevision: 0, profile, userId: "other" }).success, false);
});

test("aceita somente o indicador da VPN e bloqueia propriedades desconhecidas", () => {
  for (const extra of [
    { vpnName: "Rede local" },
    { vpn: { enabled: true, name: "Rede local", server: "vpn.example.test" } },
    { log: "diagnóstico" },
  ]) {
    assert.equal(portableProfileSchema.safeParse({ ...profile, ...extra }).success, false);
  }
  const theme = { ...profile.theme, unknown: true };
  assert.equal(portableProfileSchema.safeParse({ ...profile, theme }).success, false);
});

test("rejeita caminhos locais e comandos como identificadores portáteis", () => {
  for (const applications of [
    [{ kind: "executable", executable: "C:\\Apps\\Editor.exe" }],
    [{ kind: "executable", executable: "Editor.exe", path: "C:\\Apps\\Editor.exe" }],
    [{ kind: "executable", executable: "cmd.exe /c Editor.exe" }],
    [{ kind: "packaged", appId: "shell:AppsFolder\\MSTeams_8wekyb3d8bbwe!MSTeams" }],
  ]) {
    assert.equal(portableProfileSchema.safeParse({ ...profile, applications }).success, false);
  }
  const browser = { ...profile.browser, path: "C:\\Apps\\Browser.exe" };
  assert.equal(portableProfileSchema.safeParse({ ...profile, browser }).success, false);
  assert.equal(portableProfileSchema.safeParse({ ...profile, description: "Arquivo em C:\\Documentos" }).success, false);
});

test("rejeita links de arquivo e URLs com dados potencialmente sensíveis", () => {
  for (const url of [
    "file:///C:/Documentos/index.html",
    "https://user:password@example.test/",
    "https://example.test/?token=sample",
    "https://example.test/#access_token=sample",
    "https://example.test/reset/sample",
    "https://example.test/%74oken/sample",
    "https://example.test/tools/eyJ0ZXN0.demo.signature",
    "https://example.test/C%3A%2FDocuments/",
  ]) {
    const browser = { ...profile.browser, urls: [url] };
    assert.equal(portableProfileSchema.safeParse({ ...profile, browser }).success, false, url);
  }
});
