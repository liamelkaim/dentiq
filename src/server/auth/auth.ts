import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { Database } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";
import { getMailer, type Mailer } from "@/server/email";
import { isBootstrapAdmin, isEmailDomainAllowed } from "./roles";

type AuthOptions = {
  mailer?: Mailer;
  /** Next.js cookie integration; off in tests, which run outside a request. */
  nextjs?: boolean;
};

export function createAuth(db: Database, { mailer, nextjs = true }: AuthOptions = {}) {
  const plugins: BetterAuthPlugin[] = nextjs ? [nextCookies()] : [];

  return betterAuth({
    appName: "Dentiq",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
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
            if (!isEmailDomainAllowed(newUser.email)) {
              throw new APIError("BAD_REQUEST", { message: "EMAIL_DOMAIN_NOT_ALLOWED" });
            }
            if (isBootstrapAdmin(newUser.email)) {
              return { data: { ...newUser, role: "admin", approvalStatus: "approved" } };
            }
            return { data: { ...newUser, role: "student", approvalStatus: "pending" } };
          },
        },
      },
    },
    rateLimit: {
      // Better Auth's limiter; enabled in production. In-memory, so per server instance.
      enabled: process.env.NODE_ENV === "production",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
