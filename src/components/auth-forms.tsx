"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "./ui";

type AuthError = { code?: string; message?: string; status?: number } | null;

/** Maps Better Auth error codes to translation keys under auth.errors. */
function errorKey(error: AuthError): string {
  if (!error) return "generic";
  if (error.status === 429) return "tooManyRequests";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalidCredentials";
    case "EMAIL_NOT_VERIFIED":
      return "emailNotVerified";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "emailExists";
    case "PASSWORD_TOO_SHORT":
      return "weakPassword";
  }
  if (error.message === "EMAIL_DOMAIN_NOT_ALLOWED") return "domainNotAllowed";
  return "generic";
}

function useAuthForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  return { error, setError, submitting, setSubmitting };
}

export function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { error, setError, submitting, setSubmitting } = useAuthForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/verify-email/result",
    });
    setSubmitting(false);
    if (error) return setError(errorKey(error));
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
      {error && <Notice tone={error === "emailNotVerified" ? "warning" : "danger"}>{t(`errors.${error}`)}</Notice>}
      <Field label={t("fields.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field label={t("fields.password")} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={submitting} className="mt-1 w-full">
        {submitting ? "…" : t("signIn.submit")}
      </Button>
      <p className="text-center text-[14px]">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-medium text-accent hover:text-accent-hover">
          {t("signIn.forgot")}
        </Link>
      </p>
      <p className="text-center text-[14px] text-text-muted">
        {t("signIn.noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-accent hover:text-accent-hover">
          {t("signIn.createAccount")}
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { error, setError, submitting, setSubmitting } = useAuthForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 10) return setError("weakPassword");
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      password,
      callbackURL: "/verify-email/result",
    });
    setSubmitting(false);
    if (error) return setError(errorKey(error));
    router.push("/verify-email");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="danger">{t(`errors.${error}`)}</Notice>}
      <Field label={t("fields.name")} htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label={t("fields.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field label={t("fields.password")} htmlFor="password" hint={t("fields.passwordHint")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          aria-describedby="password-hint"
        />
      </Field>
      <Button type="submit" disabled={submitting} className="mt-1 w-full">
        {submitting ? "…" : t("signUp.submit")}
      </Button>
      <p className="text-center text-[14px] text-text-muted">
        {t("signUp.haveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-accent hover:text-accent-hover">
          {t("signUp.signInLink")}
        </Link>
      </p>
    </form>
  );
}

/** Asks for a fresh confirmation link. The answer never says whether the address has an account. */
export function ResendVerificationForm() {
  const t = useTranslations("auth");
  const { error, setError, submitting, setSubmitting } = useAuthForm();
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.sendVerificationEmail({ email: String(form.get("email")).trim(), callbackURL: "/verify-email/result" });
    setSubmitting(false);
    if (error) return setError(errorKey(error));
    setSent(true);
  }

  if (sent) return <Notice tone="success">{t("resend.sent")}</Notice>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="danger">{t(`errors.${error}`)}</Notice>}
      <Field label={t("fields.email")} htmlFor="resend-email">
        <Input id="resend-email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "…" : t("resend.submit")}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const { error, setError, submitting, setSubmitting } = useAuthForm();
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: String(form.get("email")).trim(), redirectTo: "/reset-password" });
    setSubmitting(false);
    if (error) return setError(errorKey(error));
    setSent(true);
  }

  if (sent) return <Notice tone="success">{t("forgot.sent")}</Notice>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="danger">{t(`errors.${error}`)}</Notice>}
      <Field label={t("fields.email")} htmlFor="forgot-email">
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "…" : t("forgot.submit")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const { error, setError, submitting, setSubmitting } = useAuthForm();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 10) return setError("weakPassword");
    if (password !== String(form.get("confirm"))) return setError("passwordMismatch");
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setSubmitting(false);
    if (error) return setError(error.code === "INVALID_TOKEN" ? "resetLinkInvalid" : errorKey(error));
    router.push("/sign-in?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="danger">{t(`errors.${error}`)}</Notice>}
      <Field label={t("reset.newPassword")} htmlFor="reset-password" hint={t("fields.passwordHint")}>
        <Input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      </Field>
      <Field label={t("reset.confirm")} htmlFor="reset-confirm">
        <Input id="reset-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      </Field>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "…" : t("reset.submit")}
      </Button>
    </form>
  );
}
