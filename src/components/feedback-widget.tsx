"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { submitFeedbackAction, type FeedbackState } from "@/server/feedback/actions";
import { FEEDBACK_MESSAGE_MAX } from "@/server/feedback/constants";
import { Button, Field, Input, Notice, Select, Textarea } from "./ui";
import { useKeepingForm } from "./use-keeping-form";

const idle: FeedbackState = { status: "idle" };
const TYPES = ["bug", "idea", "question", "other"] as const;

/** A Feedback button on every page. The form is a native <dialog>: focus is trapped inside, Escape closes it, and focus returns to the button. */
export function FeedbackWidget({ contactEmail }: { contactEmail: string | null }) {
  const t = useTranslations("feedback");
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit, formRef } = useKeepingForm(submitFeedbackAction, idle, { resetOnSuccess: true });

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex h-11 items-center rounded-[10px] border border-border-strong bg-surface px-4 text-[14px] font-medium text-text shadow-card hover:bg-surface-hover lg:bottom-5"
      >
        {t("button")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="feedback-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[14px] border border-border bg-surface p-0 text-text shadow-card backdrop:bg-black/50"
      >
        {open && (
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="feedback-title" className="text-[18px] font-semibold">
                {state.status === "sent" ? t("thanksTitle") : t("title")}
              </h2>
              <button type="button" onClick={close} aria-label={t("close")} className="grid size-11 shrink-0 place-items-center rounded-[10px] text-text-muted hover:bg-surface-muted">
                <span aria-hidden="true" className="text-[22px] leading-none">
                  &times;
                </span>
              </button>
            </div>
            {state.status === "sent" ? (
              <div className="flex flex-col gap-4">
                <p className="text-[15px] text-text-muted">{t("thanksBody")}</p>
                <Button type="button" onClick={close}>
                  {t("close")}
                </Button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
                <p className="text-[13px] text-text-muted">{t("warning")}</p>
                {state.status === "error" && <Notice tone="danger">{t.has(`errors.${state.message}`) ? t(`errors.${state.message}`) : t("errors.generic")}</Notice>}
                <input type="hidden" name="pageUrl" value={pathname} />
                <Field label={t("type")} htmlFor="fb-type">
                  <Select id="fb-type" name="type" defaultValue="idea">
                    {TYPES.map((k) => (
                      <option key={k} value={k}>
                        {t(`types.${k}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("message")} htmlFor="fb-message" hint={t("messageHint", { max: FEEDBACK_MESSAGE_MAX })}>
                  <Textarea id="fb-message" name="message" rows={5} required minLength={5} maxLength={FEEDBACK_MESSAGE_MAX} aria-describedby="fb-message-hint" />
                </Field>
                <Field label={t("email")} htmlFor="fb-email" hint={t("emailHint")}>
                  <Input id="fb-email" name="email" type="email" autoComplete="email" maxLength={254} aria-describedby="fb-email-hint" />
                </Field>
                <p className="text-[12px] text-text-subtle">{t("pageNote", { path: pathname })}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={pending}>
                    {pending ? t("sending") : t("send")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={close}>
                    {t("cancel")}
                  </Button>
                  {contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="ml-auto inline-flex min-h-11 items-center text-[14px] font-medium text-accent hover:text-accent-hover">
                      {t("emailUs")}
                    </a>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
