import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

function findEnvFile(): string | undefined {
    // Search upward from the current module location
    let current = dirname(fileURLToPath(import.meta.url));
    while (true) {
        const candidate = join(current, ".env");
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    // Search upward from process.cwd() as fallback
    let cwdCandidate = process.cwd();
    while (true) {
        const candidate = join(cwdCandidate, ".env");
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(cwdCandidate);
        if (parent === cwdCandidate) {
            break;
        }
        cwdCandidate = parent;
    }

    return undefined;
}

const envPath = findEnvFile();
if (envPath) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const envSchema = z.object({
    PORT: z.coerce.number().default(5000),
    HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
    PARTNER_KEY_HASH_SECRET: z.string().min(32).optional(),
    PUBLIC_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    PARTNER_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    PARTNER_BULK_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    OUTBOX_WORKER_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
    OUTBOX_LEASE_DURATION_MS: z.coerce.number().int().positive().default(30000),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().max(50).default(5),
    OUTBOX_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
    OUTBOX_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(60000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("Environment configuration error:\n" + issues.join("\n"));
    process.exit(1);
}

export const env = parsedEnv.data;