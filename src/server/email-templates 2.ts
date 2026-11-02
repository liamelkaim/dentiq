// Account emails: French first, English below, as HTML and plain text. We do not know a recipient's language when the
// message is sent, so each message carries both. Links are escaped for HTML; nothing else is interpolated.
import type { EmailMessage } from "./email";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Copy = { heading: string; body: string; button: string; ignore: string; expires: string };

function render(to: string, subject: string, fr: Copy, en: Copy, url: string): EmailMessage {
  const block = (c: Copy) =>
    `<h2 style="margin:0 0 8px;font-size:18px">${esc(c.heading)}</h2><p style="margin:0 0 16px">${esc(c.body)}</p>` +
    `<p style="margin:0 0 16px"><a href="${esc(url)}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(c.button)}</a></p>` +
    `<p style="margin:0 0 4px;font-size:13px;color:#4b5563">${esc(c.expires)}</p><p style="margin:0;font-size:13px;color:#4b5563">${esc(c.ignore)}</p>`;
  const html =
    `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:520px;margin:0 auto;padding:24px">` +
    `${block(fr)}<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">${block(en)}</body></html>`;
  const text = [fr, en].map((c) => `${c.heading}\n${c.body}\n${url}\n${c.expires}\n${c.ignore}`).join("\n\n---\n\n");
  return { to, subject, text, html };
}

export function verificationEmail(to: string, url: string, hours: number): EmailMessage {
  return render(
    to,
    "Dentiq · confirmez votre adresse / confirm your email",
    {
      heading: "Confirmez votre adresse courriel",
      body: "Merci de vous être inscrit à Dentiq. Confirmez votre adresse pour activer votre compte.",
      button: "Confirmer mon adresse",
      expires: `Ce lien expire dans ${hours} heures.`,
      ignore: "Si vous n’avez pas créé de compte, ignorez ce message.",
    },
    {
      heading: "Confirm your email address",
      body: "Thanks for signing up to Dentiq. Confirm your address to activate your account.",
      button: "Confirm my email",
      expires: `This link expires in ${hours} hours.`,
      ignore: "If you did not create an account, ignore this message.",
    },
    url,
  );
}

export function passwordResetEmail(to: string, url: string, hours: number): EmailMessage {
  return render(
    to,
    "Dentiq · réinitialisation du mot de passe / password reset",
    {
      heading: "Réinitialiser votre mot de passe",
      body: "Nous avons reçu une demande de réinitialisation de votre mot de passe Dentiq.",
      button: "Choisir un nouveau mot de passe",
      expires: `Ce lien expire dans ${hours} heure${hours > 1 ? "s" : ""}.`,
      ignore: "Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe ne change pas.",
    },
    {
      heading: "Reset your password",
      body: "We received a request to reset your Dentiq password.",
      button: "Choose a new password",
      expires: `This link expires in ${hours} hour${hours > 1 ? "s" : ""}.`,
      ignore: "If you did not ask for this, ignore this message: your password stays the same.",
    },
    url,
  );
}
