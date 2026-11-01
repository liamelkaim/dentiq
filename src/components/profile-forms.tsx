"use client";

// Forms for the profile page. They only collect input; the server actions and services check every rule again.
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { deleteAccountAction, updateNameAction, type AccountFormState } from "@/server/account/actions";
import { PROFILE_NAME_MAX } from "@/server/account/constants";
import { Button, ButtonLink, Field, Input, Notice, Panel } from "./ui";

const idle: AccountFormState = { status: "idle" };

function errorText(t: ReturnType<typeof useTranslations>, code: string | undefined): string | undefined {
  if (!code) return undefined;
  return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.invalid");
}

export function NameForm({ initialName }: { initialName: string }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(updateNameAction, idle);
  const error = state.status === "error" ? errorText(t, state.message) : undefined;
  return (
    <Panel className="p-4 sm:p-5">
      <form action={action} className="flex flex-col gap-3">
        <Field label={t("name")} htmlFor="profile-name" hint={t("nameHelp", { max: PROFILE_NAME_MAX })} error={error}>
          <Input
            id="profile-name"
            name="name"
            required
            autoComplete="name"
            maxLength={PROFILE_NAME_MAX}
            defaultValue={initialName}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "profile-name-error" : "profile-name-hint"}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("nameSave")}
          </Button>
          {state.status === "saved" && (
            <span role="status" className="text-[13px] text-success">
              {t("nameSaved")}
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
}

export function DeleteAccountForm({ email, blockedLastAdmin }: { email: string; blockedLastAdmin: boolean }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState(deleteAccountAction, idle);
  const error = state.status === "error" ? errorText(t, state.message) : undefined;
  // Errors about the typed email or the password sit next to their field; the rest go in the banner.
  const confirmError = state.message === "confirmationMismatch" ? error : undefined;
  const passwordError = state.message === "wrongPassword" ? error : undefined;
  const banner = error && !confirmError && !passwordError ? error : undefined;
  return (
    <Panel className="p-4 sm:p-6">
      {blockedLastAdmin && (
        <Notice tone="warning" className="mb-4">
          {t("delete.lastAdmin")}
        </Notice>
      )}
      <form action={action} className="flex flex-col gap-4" autoComplete="off">
        {banner && <Notice tone="danger">{banner}</Notice>}
        <Field label={t("delete.confirmLabel")} htmlFor="delete-confirmation" hint={t("delete.confirmHint", { email })} error={confirmError}>
          <Input
            id="delete-confirmation"
            name="confirmation"
            type="email"
            required
            inputMode="email"
            autoComplete="off"
            disabled={blockedLastAdmin}
            aria-invalid={Boolean(confirmError)}
          />
        </Field>
        <Field label={t("delete.passwordLabel")} htmlFor="delete-password" hint={t("delete.passwordHint")} error={passwordError}>
          <Input
            id="delete-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={blockedLastAdmin}
            aria-invalid={Boolean(passwordError)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" disabled={pending || blockedLastAdmin}>
            {t("delete.submit")}
          </Button>
          <ButtonLink href="/profile" variant="ghost">
            {t("delete.cancel")}
          </ButtonLink>
        </div>
      </form>
    </Panel>
  );
}
