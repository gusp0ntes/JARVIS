import { z } from "zod";

const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.int().positive());
const ttlUnits = { s: 1, m: 60, h: 3600 } as const;

const accessTokenTtl = z.string().regex(/^[1-9]\d{0,3}[smh]$/)
  .transform((value) => Number(value.slice(0, -1)) * ttlUnits[value.slice(-1) as keyof typeof ttlUnits])
  .pipe(z.int().positive().max(3600));

const mongodbUri = z.url({ protocol: /^mongodb(?:\+srv)?$/ }).refine((value) => {
  const url = URL.parse(value);
  if (!url?.hostname || /[<>]/.test(value)) return false;

  for (const [option, setting] of url.searchParams) {
    const key = option.toLowerCase();
    if (["tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames"].includes(key) &&
        setting.toLowerCase() !== "false") return false;
    if (url.protocol === "mongodb+srv:" && ["tls", "ssl"].includes(key) &&
        setting.toLowerCase() !== "true") return false;
  }
  return true;
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: positiveInteger.pipe(z.int().max(65535)).prefault("3001"),
  TRUST_PROXY_HOPS: z.string().regex(/^\d+$/).transform(Number).pipe(z.int().min(0).max(10)).prefault("0"),
  MONGODB_URI: mongodbUri,
  JWT_ACCESS_SECRET: z.string().trim().min(32),
  ACCESS_TOKEN_TTL: accessTokenTtl.prefault("15m"),
  REFRESH_TOKEN_TTL_DAYS: positiveInteger.pipe(z.int().max(365)).prefault("30"),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "production") return;
  const url = URL.parse(value.MONGODB_URI);
  if (url?.protocol !== "mongodb:") return;
  const sslOptions = [...url.searchParams].filter(([key]) => ["tls", "ssl"].includes(key.toLowerCase()));
  if (!sslOptions.length || sslOptions.some(([, setting]) => setting.toLowerCase() !== "true")) {
    context.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "O MongoDB precisa usar TLS em produção." });
  }
});

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map(({ path }) => path.join("."));
    throw new Error(`Configuração inválida nas variáveis ${[...new Set(keys)].join(", ")}.`);
  }
  return result.data;
}
