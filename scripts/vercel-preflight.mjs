// Fail before producing a broken hosted app. Never print secret values.
const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_EMAILS"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing deployment environment variables: ${missing.join(", ")}`);
if (process.env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
if (!process.env.BETTER_AUTH_URL.startsWith("https://")) throw new Error("BETTER_AUTH_URL must be your HTTPS Vercel domain");
const database = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(database.protocol) || ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) throw new Error("DATABASE_URL must point to hosted PostgreSQL");
if (process.env.ALLOW_LOCAL_DATABASE === "true") throw new Error("Remove ALLOW_LOCAL_DATABASE before deploying");
console.info("Required deployment settings are present. Run database migrations before deployment.");
