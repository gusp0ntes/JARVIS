const { z } = require("zod");

const localPath = /(?:\b[a-z]:[\\/]|\\\\|\bfile:\/\/)/i;
const secretPath = /\/(?:[\w-]*(?:token|secret|signature|password)|(?:api|access)[-_]?key|session(?:[-_]?id)?|magic[-_]?link|reset|invite|verify)\b[=/][^/]/i;
const opaqueSegment = /^(?:[a-f\d]{32,}|[a-z\d_]{40,}|eyJ[a-z\d_-]+(?:\.[a-z\d_-]+){2,})$/i;

/** @param {number} maxLength */
function portableText(maxLength) {
  return z.string().max(maxLength).refine((value) => !localPath.test(value), {
    message: "Caminhos locais ficam neste dispositivo.",
  });
}

/** @param {string} value */
function isPortableUrl(value) {
  if (/[\s\\?#]/.test(value) || !/^https?:\/\/[^/@]+(?:\/|$)/i.test(value)) return false;
  const url = URL.parse(value);
  if (!url || url.username || url.password) return false;

  try {
    const pathname = decodeURIComponent(url.pathname);
    return !/[%\\?#]/.test(pathname) && !localPath.test(pathname) && !secretPath.test(pathname) &&
      !pathname.split("/").some((segment) => opaqueSegment.test(segment));
  } catch {
    return false;
  }
}

const portableUrl = z.string().max(2048).refine(isPortableUrl, {
  message: "Use uma URL HTTP(S) sem credenciais, parâmetros, fragmentos ou caminhos sensíveis.",
});

const applicationName = portableText(160).optional();
const portableApplication = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("packaged"),
    appId: z.string().max(256).regex(/^[a-z\d][a-z\d._-]*![a-z\d][a-z\d._-]*$/i),
    name: applicationName,
  }),
  z.strictObject({
    kind: z.literal("executable"),
    executable: z.string().max(255).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._()+-]*\.exe$/iu),
    name: applicationName,
  }),
]);

const color = z.string().regex(/^#[\da-f]{6}$/i);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const notification = z.strictObject({
  title: portableText(80),
  message: portableText(240),
});

const portableProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: portableText(80),
  description: portableText(160),
  theme: z.strictObject({
    mode: z.enum(["solid", "gradient"]),
    primaryColor: color,
    secondaryColor: color,
  }),
  applications: z.array(portableApplication),
  browser: z.strictObject({
    enabled: z.boolean(),
    id: z.enum(["opera", "chrome", "edge", "firefox"]).nullable(),
    urls: z.array(portableUrl),
  }),
  vpnEnabled: z.boolean(),
  routine: z.strictObject({
    enabled: z.boolean(),
    breakEnabled: z.boolean(),
    schedule: z.strictObject({
      start: time,
      lunchStart: time,
      lunchEnd: time,
      end: time,
    }),
  }),
  notifications: z.strictObject({
    enabled: z.boolean(),
    sound: z.boolean(),
    duration: z.int().min(2).max(30),
    messages: z.strictObject({
      start: notification,
      lunchStart: notification,
      lunchEnd: notification,
      end: notification,
    }),
  }),
});

const profileWriteSchema = z.strictObject({
  expectedRevision: z.int().nonnegative(),
  profile: portableProfileSchema,
});

const profileDeleteSchema = z.strictObject({ expectedRevision: z.int().positive() });

const profileRecordSchema = z.strictObject({
  profile: portableProfileSchema.nullable(),
  revision: z.int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});

module.exports = {
  portableText, portableUrl, portableApplication, portableProfileSchema,
  profileWriteSchema, profileDeleteSchema, profileRecordSchema,
};
