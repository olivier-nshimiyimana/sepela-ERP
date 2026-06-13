import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORTAL_BEARER_TOKEN: z.string().min(1, "PORTAL_BEARER_TOKEN is required"),
  LEASE_SIGNING_SECRET: z.string().min(16, "LEASE_SIGNING_SECRET must be at least 16 characters"),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:1420,http://127.0.0.1:1420"
    ),
  PORTAL_BOOTSTRAP_ADMIN_USERNAME: z.string().min(2).max(80).optional(),
  PORTAL_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(6).max(200).optional(),
  PORTAL_SECURITY_WEBHOOK_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    }),
  LOGIN_SPIKE_THRESHOLD: z.coerce.number().int().positive().default(5),
  LOGIN_SPIKE_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  corsOrigins: parsed.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
