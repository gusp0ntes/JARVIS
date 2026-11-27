import { Schema, type Connection, type Types } from "mongoose";
import type { PortableProfile } from "../schemas/profile.js";

interface ProfileRecord {
  userId: Types.ObjectId;
  profile?: PortableProfile;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<ProfileRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  profile: { type: Schema.Types.Mixed },
  revision: { type: Number, required: true },
}, { timestamps: true, versionKey: false });

profileSchema.index({ userId: 1 }, { unique: true });

export async function createProfileModel(connection: Connection) {
  const Profile = connection.model("Profile", profileSchema, "profiles");
  await Profile.init();
  return Profile;
}
