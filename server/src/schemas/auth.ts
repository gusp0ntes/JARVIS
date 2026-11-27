import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(1).max(256).regex(/^[^\p{Cs}]+$/u).refine((value) => Array.from(value).length <= 128, {
  message: "A senha pode ter até 128 caracteres.",
});

export const loginSchema = z.strictObject({ email, password });

export const registrationSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  email,
  password: password.refine((value) => Array.from(value).length >= 15, {
    message: "Use uma senha com pelo menos 15 caracteres.",
  }),
  passwordConfirmation: password,
}).refine((data) => data.password === data.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "As senhas precisam ser iguais.",
});

export const refreshSchema = z.strictObject({ refreshToken: z.string().min(1).max(256) });
export const accountUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  email: email.optional(),
  currentPassword: password.optional(),
}).refine((input) => Boolean(input.name || input.email))
  .refine((input) => input.email === undefined || Boolean(input.currentPassword), { path: ["currentPassword"] });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
