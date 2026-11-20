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
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    console.error("Environment configuration error:\n" + issues.join("\n"));
    process.exit(1);
}

export const env = parsedEnv.data;