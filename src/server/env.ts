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
});

export type Env = z.infer<typeof envSchema>;

/** Validates configuration. Throws one readable error listing every problem. */
export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`DentOS configuration is invalid. Check your .env file:\n${problems}`);
  }
  if (result.data.NODE_ENV === "production" && !result.data.DATABASE_URL) {
    throw new Error("DentOS configuration is invalid: DATABASE_URL is required in production.");
  }
  return result.data;
}
