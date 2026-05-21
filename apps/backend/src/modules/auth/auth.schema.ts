import { z } from 'zod';

export const registerSchema = z.object({
  companyName: z.string().min(2),
  region: z.string().min(2),
  email: z.string().email(),
  plan: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
  password: z.string().min(8),
  fullName: z.string().min(1).max(120).optional(),
  desiredSlug: z.string().min(2).max(40).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const firebaseLoginSchema = z.object({
  idToken: z.string().min(20)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8)
});
