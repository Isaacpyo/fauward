import { z } from "zod";

const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default("Fauward Go"),
  VITE_API_BASE_URL: z.string().min(1).default("http://localhost:8080"),
  VITE_SENTRY_DSN: z.string().default(""),
  VITE_ENABLE_LOCATION: z.enum(["true", "false"]).default("true"),
  VITE_ENABLE_BACKGROUND_SYNC: z.enum(["true", "false"]).default("true"),
  VITE_MAX_PHOTO_SIZE_MB: z.coerce.number().positive().default(8),
  VITE_SYNC_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  VITE_LOCATION_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
});

const parsed = envSchema.parse({
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_ENABLE_LOCATION: import.meta.env.VITE_ENABLE_LOCATION,
  VITE_ENABLE_BACKGROUND_SYNC: import.meta.env.VITE_ENABLE_BACKGROUND_SYNC,
  VITE_MAX_PHOTO_SIZE_MB: import.meta.env.VITE_MAX_PHOTO_SIZE_MB,
  VITE_SYNC_BATCH_SIZE: import.meta.env.VITE_SYNC_BATCH_SIZE,
  VITE_LOCATION_INTERVAL_MS: import.meta.env.VITE_LOCATION_INTERVAL_MS,
});

export const appEnv = {
  name: parsed.VITE_APP_NAME,
  apiBaseUrl: parsed.VITE_API_BASE_URL,
  sentryDsn: parsed.VITE_SENTRY_DSN,
  enableLocation: parsed.VITE_ENABLE_LOCATION === "true",
  enableBackgroundSync: parsed.VITE_ENABLE_BACKGROUND_SYNC === "true",
  maxPhotoSizeMb: parsed.VITE_MAX_PHOTO_SIZE_MB,
  syncBatchSize: parsed.VITE_SYNC_BATCH_SIZE,
  locationIntervalMs: parsed.VITE_LOCATION_INTERVAL_MS,
};

