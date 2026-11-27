import { Schema, type Connection } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true, versionKey: false });

userSchema.index({ email: 1 }, { unique: true });

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  refreshTokenHash: { type: String, required: true, select: false },
  tokenFamilyId: { type: String, required: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  lastUsedAt: { type: Date, required: true },
}, { versionKey: false });

sessionSchema.index({ tokenFamilyId: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export async function createAuthModels(connection: Connection) {
  const User = connection.model("User", userSchema, "users");
  const Session = connection.model("Session", sessionSchema, "sessions");
  await Promise.all([User.init(), Session.init()]);
  return { User, Session };
}
