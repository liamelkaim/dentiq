import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { Database } from "@/db/client";
import { account, authRateLimit, session, user, verification } from "@/db/schema";
import { trustedIpHeaders } from "@/server/rate-limit/client-ip";
import { getMailer, type Mailer } from "@/server/email";
import { isBootstrapAdmin, isEmailDomainAllowed } from "./roles";

type AuthOptions = {
  mailer?: Mailer;
  /** Next.js cookie integration; off in tests, which run outside a request. */
  nextjs?: boolean;
  /** Override for the rate limiter (it follows NODE_ENV otherwise: on in production only). Tests turn it on. */
  rateLimitEnabled?: boolean;
  /** Trusted client-IP headers; defaults to the TRUSTED_IP_HEADER setting (see src/server/rate-limit/client-ip.ts). */
  ipHeaders?: string[];
};

export function createAuth(db: Database, { mailer, nextjs = true, rateLimitEnabled, ipHeaders }: AuthOptions = {}) {
  const plugins: BetterAuthPlugin[] = nextjs ? [nextCookies()] : [];

  return betterAuth({
    appName: "Dentiq",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      // rateLimit: Better Auth's table for rateLimit.storage "database" (model name "rateLimit").
      schema: { user, session, account, verification, rateLimit: authRateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in with an unverified email sends a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await (mailer ?? getMailer()).send({
          to: user.email,
          subject: "Dentiq · confirmez votre adresse / confirm your email",
          text: `Confirmez votre adresse courriel / Confirm your email:\n${url}`,
        });
      },
    },
    user: {
      additionalFields: {
        // input: false — clients can never set these when signing up or updating their profile.
        role: { type: "string", defaultValue: "student", input: false },
        approvalStatus: { type: "string", defaultValue: "pending", input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          async before(newUser) {
            // The administrator may use any address (it is named in ADMIN_EMAILS); every student must use an allowed
            // university address (ALLOWED_EMAIL_DOMAINS, e.g. umontreal.ca) and then verify it and be approved.
            if (isBootstrapAdmin(newUser.email)) {
              return { data: { ...newUser, role: "admin", approvalStatus: "approved" } };
            }
            if (!isEmailDomainAllowed(newUser.email)) {
              throw new APIError("BAD_REQUEST", { message: "EMAIL_DOMAIN_NOT_ALLOWED" });
            }
            return { data: { ...newUser, role: "student", approvalStatus: "pending" } };
          },
        },
      },
    },
    rateLimit: {
      // Better Auth's limiter; enabled in production. Counters live in the database (table auth_rate_limit), so every
      // serverless instance shares them. Keys are "<client ip>|<path>"; which header carries the IP: see advanced.ipAddress.
      enabled: rateLimitEnabled ?? process.env.NODE_ENV === "production",
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      // Only a header our own proxy overwrites may be trusted for the client IP (otherwise the sign-in limit can be dodged
      // by forging it). On Vercel that is x-forwarded-for; elsewhere none unless TRUSTED_IP_HEADER says so.
      ipAddress: { ipAddressHeaders: ipHeaders ?? trustedIpHeaders() },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
