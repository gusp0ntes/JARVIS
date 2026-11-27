import { randomBytes } from "node:crypto";
import { argon2id, hash, verify, type HashOptions } from "argon2";
import type { Connection, Types } from "mongoose";
import { isDuplicateKey } from "../config/database.js";
import type { loadEnvironment } from "../config/env.js";
import { ApiError, invalidSession } from "../http/errors.js";
import { createAuthModels } from "../models/auth.js";
import type { AccountUpdateInput, LoginInput, RegistrationInput } from "../schemas/auth.js";
import { createTokenService } from "./tokens.js";

export type AuthConfig = Pick<ReturnType<typeof loadEnvironment>,
  "JWT_ACCESS_SECRET" | "ACCESS_TOKEN_TTL" | "REFRESH_TOKEN_TTL_DAYS">;

const passwordOptions: HashOptions = { type: argon2id, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const dayInMilliseconds = 86_400_000;

function publicUser(user: { _id: Types.ObjectId; name: string; email: string }) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

export async function createAuthService(connection: Connection, config: AuthConfig) {
  const [{ User, Session }, unknownUserHash] = await Promise.all([
    createAuthModels(connection),
    hash(randomBytes(32), passwordOptions),
  ]);
  const tokens = createTokenService(config.JWT_ACCESS_SECRET, config.ACCESS_TOKEN_TTL);

  function activeSession(familyId: string, now: Date) {
    return { tokenFamilyId: familyId, revokedAt: null, expiresAt: { $gt: now } };
  }

  return {
    async register(input: RegistrationInput) {
      const passwordHash = await hash(input.password, passwordOptions);
      try {
        const user = await User.create({ name: input.name, email: input.email, passwordHash });
        return publicUser(user);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ApiError(409, "REGISTRATION_UNAVAILABLE", "Não foi possível concluir o cadastro com os dados informados.");
        }
        throw error;
      }
    },

    async login(input: LoginInput) {
      const user = await User.findOne({ email: input.email }).select("+passwordHash").lean();
      const passwordMatches = await verify(user?.passwordHash ?? unknownUserHash, input.password);
      if (!user || !passwordMatches) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
      }

      const tokenFamilyId = tokens.newFamilyId();
      const refresh = tokens.createRefreshToken(tokenFamilyId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + config.REFRESH_TOKEN_TTL_DAYS * dayInMilliseconds);
      const access = await tokens.createAccessToken(user._id.toString(), tokenFamilyId, expiresAt);
      await Session.create({
        userId: user._id,
        tokenFamilyId,
        refreshTokenHash: refresh.hash,
        expiresAt,
        createdAt: now,
        lastUsedAt: now,
      });
      return { ...access, refreshToken: refresh.token, user: publicUser(user) };
    },

    async refresh(token: string) {
      const current = tokens.readRefreshToken(token);
      if (!current) throw invalidSession();

      const next = tokens.createRefreshToken(current.familyId);
      const now = new Date();
      const active = activeSession(current.familyId, now);
      const session = await Session.findOneAndUpdate(
        { ...active, refreshTokenHash: current.hash },
        { $set: { refreshTokenHash: next.hash, lastUsedAt: now } },
        { returnDocument: "after" },
      ).lean();

      if (!session) {
        // Only an authentic token from this family can trigger reuse revocation.
        await Session.updateOne(
          { ...active, refreshTokenHash: { $ne: current.hash } },
          { $set: { revokedAt: now } },
        );
        throw invalidSession();
      }

      const user = await User.findById(session.userId).lean();
      if (!user) throw invalidSession();
      const access = await tokens.createAccessToken(user._id.toString(), current.familyId, session.expiresAt);
      return { ...access, refreshToken: next.token, user: publicUser(user) };
    },

    async logout(token: string) {
      const current = tokens.readRefreshToken(token);
      if (!current) return;

      const now = new Date();
      await Session.updateOne(activeSession(current.familyId, now), { $set: { revokedAt: now } });
    },

    async authenticate(token: string) {
      const claims = await tokens.readAccessToken(token);
      if (!claims) throw invalidSession();

      const session = await Session.exists({ ...activeSession(claims.familyId, new Date()), userId: claims.userId });
      if (!session) throw invalidSession();

      const user = await User.findById(claims.userId).lean();
      if (!user) throw invalidSession();
      return publicUser(user);
    },

    async updateAccount(userId: string, input: AccountUpdateInput) {
      if (input.email && input.currentPassword) {
        const user = await User.findById(userId).select("+passwordHash").lean();
        if (!user) throw invalidSession();
        if (!await verify(user.passwordHash, input.currentPassword)) {
          throw new ApiError(401, "INVALID_CREDENTIALS", "Senha atual inválida.");
        }
      }
      try {
        const user = await User.findByIdAndUpdate(userId,
          { $set: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) } },
          { returnDocument: "after" },
        ).lean();
        if (!user) throw invalidSession();
        return publicUser(user);
      } catch (error) {
        if (isDuplicateKey(error)) throw new ApiError(409, "ACCOUNT_UNAVAILABLE", "Não foi possível usar o e-mail informado.");
        throw error;
      }
    },
  };
}

export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
