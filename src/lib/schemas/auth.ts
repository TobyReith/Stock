import { z } from "zod";

/**
 * Auth form schemas — shared between client and server validation.
 *
 * Kept deliberately lean: Supabase does the real "does this account
 * exist / password matches / email is verified" checks. These schemas
 * only stop us sending obvious garbage over the wire and give the form
 * fields readable German error messages.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "E-Mail fehlt")
  .email("Bitte gültige E-Mail eingeben");

/**
 * Minimum 8 chars — matches Supabase's default "weak password" guard.
 * No complexity rules beyond that: NIST SP 800-63B advises length-only.
 */
export const passwordSchema = z
  .string()
  .min(8, "Passwort muss mind. 8 Zeichen haben")
  .max(72, "Passwort darf max. 72 Zeichen haben");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name fehlt")
  .max(80, "Max. 80 Zeichen");

// ----- Login -----------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Passwort fehlt"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ----- Signup ----------------------------------------------------------

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

// ----- Forgot / reset password ----------------------------------------

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset-password form. Two fields so a fat-fingered typo doesn't lock
 * the user out of the account they just requested to recover. The
 * cross-field check lives as a refinement so it surfaces on the
 * `confirm` field the user is most likely looking at.
 */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, "Bitte Passwort bestätigen"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwörter stimmen nicht überein",
    path: ["confirm"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ----- Profile edit ----------------------------------------------------

export const updateProfileSchema = z.object({
  name: nameSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
