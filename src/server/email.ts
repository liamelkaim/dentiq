// Outgoing email. No provider is configured yet, so messages are printed to the server console.
// To go live, implement Mailer with a provider (e.g. Resend, Postmark) and pass it to createAuth.

export type EmailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.info(`\n[DentOS email] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
  },
};
