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
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  corsOrigins: parsed.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
