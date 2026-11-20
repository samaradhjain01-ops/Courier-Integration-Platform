import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  LOG_LEVEL: z.string().default("info"),
  MOCK_COURIER_USERNAME: z.string().default("samaradh"),
  MOCK_COURIER_PASSWORD: z.string().default("sholey"),
  URBANEBOLT_BASE_URL: z.string().url().default("https://uat.urbanebolt.in"),
  URBANEBOLT_USERNAME: z.string().default(""),
  URBANEBOLT_PASSWORD: z.string().default(""),
  URBANEBOLT_TIMEOUT_MS: z.coerce.number().default(15000),
  URBANEBOLT_RETRY_COUNT: z.coerce.number().default(2),
  JOB_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  JOB_MAX_ATTEMPTS: z.coerce.number().default(3)
});

export const env = schema.parse(process.env);
