import type { Connection } from "mongoose";
import { isDuplicateKey } from "../config/database.js";
import { ApiError } from "../http/errors.js";
import { createProfileModel } from "../models/profile.js";
import type { PortableProfile } from "../schemas/profile.js";

function publicRecord(record: { profile?: PortableProfile; revision: number; updatedAt: Date } | null) {
  return { profile: record?.profile ?? null, revision: record?.revision ?? 0, updatedAt: record?.updatedAt.toISOString() ?? null };
}

function conflict() {
  return new ApiError(409, "PROFILE_CONFLICT", "A versão na nuvem mudou. Consulte o perfil antes de tentar novamente.");
}

export async function createProfileService(connection: Connection) {
  const Profile = await createProfileModel(connection);
  return {
    async get(userId: string) {
      return publicRecord(await Profile.findOne({ userId }).lean());
    },
    async save(userId: string, expectedRevision: number, profile: PortableProfile) {
      if (expectedRevision === 0) {
        try { return publicRecord(await Profile.create({ userId, profile, revision: 1 })); }
        catch (error) { if (isDuplicateKey(error)) throw conflict(); throw error; }
      }
      const updated = await Profile.findOneAndUpdate(
        { userId, revision: expectedRevision },
        { $set: { profile }, $inc: { revision: 1 } },
        { returnDocument: "after" },
      ).lean();
      if (!updated) throw conflict();
      return publicRecord(updated);
    },
    async delete(userId: string, expectedRevision: number) {
      const updated = await Profile.findOneAndUpdate(
        { userId, revision: expectedRevision, profile: { $exists: true } },
        { $unset: { profile: 1 }, $inc: { revision: 1 } },
        { returnDocument: "after" },
      ).lean();
      if (!updated) throw conflict();
      return publicRecord(updated);
    },
  };
}

export type ProfileService = Awaited<ReturnType<typeof createProfileService>>;
