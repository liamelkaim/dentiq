// Console delivery is local-only. Hosted verification uses Resend.
export type EmailMessage = { to: string; subject: string; text: string };
export interface Mailer { send(message: EmailMessage): Promise<void> }

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.info(`\n[Dentiq email] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
  },
};

export function createResendMailer(apiKey: string, from: string, request: typeof fetch = fetch): Mailer {
  return {
    async send(message) {
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(15000),
      });
      // Do not log recipient information, verification links, credentials or provider response bodies.
      if (!response.ok) throw new Error(`Verification email delivery failed (${response.status})`);
    },
  };
}

/** Resend is used only on Vercel or with an explicit opt-in. A key in a local .env file is ignored. */
export function cloudEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || env.DENTIQ_ENABLE_RESEND === "true";
}

export function getMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (cloudEmailEnabled(process.env)) {
    if (apiKey && from) return createResendMailer(apiKey, from);
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required when cloud email is enabled");
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DATABASE !== "true") {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required for hosted email verification");
  }
  return consoleMailer;
}
