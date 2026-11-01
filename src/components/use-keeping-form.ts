import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";

// React types the state as Awaited<State>, which TypeScript cannot simplify for a generic State. Our states are
// plain objects, so this narrower signature describes the same function.
const useFormActionState = useActionState as unknown as <State>(
  action: (prev: State, form: FormData) => Promise<State>,
  initialState: State,
) => [State, (form: FormData) => void, boolean];

/**
 * Submits a form through a server action WITHOUT React 19's automatic form reset.
 *
 * With `<form action={fn}>`, React clears every uncontrolled field once the action settles, so a validation
 * error from the server would wipe what the student typed. This hook intercepts submit, builds the FormData
 * itself (including the clicked submit button, like a native submit) and runs the action in a transition.
 * Put `onSubmit` (and `formRef` when you pass `resetOnSuccess`) on the `<form>` instead of `action`.
 * With `resetOnSuccess`, the form is cleared only when the action reports `status: "success"`.
 */
export function useKeepingForm<State extends { status: string }>(
  action: (prev: State, form: FormData) => Promise<State>,
  initialState: State,
  options: { resetOnSuccess?: boolean } = {},
) {
  const [state, formAction, pending] = useFormActionState(action, initialState);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const resetOnSuccess = options.resetOnSuccess === true;
  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit, formRef };
}
