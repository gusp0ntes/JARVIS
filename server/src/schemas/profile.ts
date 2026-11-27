import type { z } from "zod";
import contract from "./profile-contract.cjs";

export const { portableProfileSchema, profileWriteSchema, profileDeleteSchema } = contract;
export type PortableProfile = z.infer<typeof portableProfileSchema>;
