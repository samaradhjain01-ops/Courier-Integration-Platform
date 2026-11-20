import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  LOG_LEVEL: z.string().default("info"),
  MOCK_COURIER_USERNAME: z.string().default("mock-user"),
  MOCK_COURIER_PASSWORD: z.string().default("mock-password"),
  URBANEBOLT_BASE_URL: z.string().url().default("https://uat.urbanebolt.in"),
  URBANEBOLT_USERNAME: z.string().default(""),
  URBANEBOLT_PASSWORD: z.string().default(""),
  URBANEBOLT_CUSTOMER_CODE: z.string().default(""),
  URBANEBOLT_SERVICE_TYPE: z.string().default("SDD"),
  URBANEBOLT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  URBANEBOLT_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(2),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(300),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  JOB_CONCURRENCY: z.coerce.number().int().positive().max(20).default(5),
  JOB_STALE_AFTER_MS: z.coerce.number().int().positive().default(300000)
});

export const env = schema.parse(process.env);
