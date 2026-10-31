import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .optional()
    .refine((v) => !v || /^postgres(ql)?:\/\//.test(v), "must start with postgres://"),
  BETTER_AUTH_SECRET: z
    .string({ error: "is required (generate one with: openssl rand -base64 32)" })
    .min(32, "must be at least 32 characters (generate one with: openssl rand -base64 32)")
    .refine((v) => v !== "replace-me", "still has the placeholder value from .env.example"),
  BETTER_AUTH_URL: z.url("must be the app's URL, e.g. http://localhost:3000"),
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  // Month (1-12) when the academic year starts; decides which exam passes count as "current-year".
  ACADEMIC_YEAR_START_MONTH: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 12), "must be a whole number from 1 to 12"),
});

export type Env = z.infer<typeof envSchema>;

/** Validates configuration. Throws one readable error listing every problem. */
export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Dentiq configuration is invalid. Check your .env file:\n${problems}`);
  }
  // The embedded database is for development. ALLOW_LOCAL_DATABASE=true lets you try the production
  // build on your own computer; never set it on a real server.
  if (result.data.NODE_ENV === "production" && !result.data.DATABASE_URL && source.ALLOW_LOCAL_DATABASE !== "true") {
    throw new Error("Dentiq configuration is invalid: DATABASE_URL is required in production.");
  }
  if (source.VERCEL === "1") {
    const required = ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "EMAIL_FROM"];
    const missing = required.filter((key) => !source[key]?.trim());
    if (missing.length) throw new Error(`Dentiq Vercel setup is incomplete: ${missing.join(", ")}`);
    if (source.ALLOW_LOCAL_DATABASE === "true") throw new Error("Local database mode is forbidden on Vercel");
    if (!result.data.BETTER_AUTH_URL.startsWith("https://")) throw new Error("BETTER_AUTH_URL must use HTTPS on Vercel");
    const host = new URL(result.data.DATABASE_URL!).hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error("Vercel requires a hosted PostgreSQL database");
  }
  return result.data;
}
