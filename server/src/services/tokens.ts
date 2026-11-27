import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const familyIdPattern = /^[a-zA-Z0-9_-]{22}$/;
const refreshTokenPattern = /^([a-zA-Z0-9_-]{22})\.([a-zA-Z0-9_-]{43})\.([a-zA-Z0-9_-]{43})$/;
const userIdPattern = /^[a-f0-9]{24}$/;
const issuer = "jarvis-api";
const audience = "jarvis-desktop";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createTokenService(secret: string, accessTtlSeconds: number) {
  const signingKey = Buffer.from(secret, "utf8");
  const refreshKey = createHmac("sha256", signingKey).update("jarvis/refresh-token/v1").digest();

  function refreshSignature(value: string) {
    return createHmac("sha256", refreshKey).update(value).digest("base64url");
  }

  return {
    newFamilyId() {
      return randomBytes(16).toString("base64url");
    },
    createRefreshToken(familyId: string) {
      const value = `${familyId}.${randomBytes(32).toString("base64url")}`;
      const token = `${value}.${refreshSignature(value)}`;
      return { token, hash: tokenHash(token) };
    },
    readRefreshToken(token: string) {
      const parts = refreshTokenPattern.exec(token);
      if (!parts || parts[0] !== token) return null;

      const [, familyId, nonce, signature] = parts;
      const expected = refreshSignature(`${familyId}.${nonce}`);
      if (!timingSafeEqual(Buffer.from(signature, "ascii"), Buffer.from(expected, "ascii"))) return null;

      return { familyId, hash: tokenHash(token) };
    },
    async createAccessToken(userId: string, familyId: string, sessionExpiry: Date) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = Math.min(issuedAt + accessTtlSeconds, Math.floor(sessionExpiry.getTime() / 1000));
      const accessToken = await new SignJWT({ sid: familyId })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(userId)
        .setJti(randomBytes(16).toString("base64url"))
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(signingKey);
      return { accessToken, accessTokenExpiresIn: Math.max(0, expiresAt - issuedAt) };
    },
    async readAccessToken(token: string) {
      try {
        const { payload } = await jwtVerify(token, signingKey, {
          algorithms: ["HS256"],
          typ: "JWT",
          issuer,
          audience,
          requiredClaims: ["sub", "sid", "iat", "exp"],
          maxTokenAge: accessTtlSeconds,
        });
        if (!payload.sub || !userIdPattern.test(payload.sub) ||
            typeof payload.sid !== "string" || !familyIdPattern.test(payload.sid)) return null;
        return { userId: payload.sub, familyId: payload.sid };
      } catch {
        return null;
      }
    },
  };
}
