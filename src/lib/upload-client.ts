// Browser side of the upload endpoint (/api/uploads/<kind>). Has the same shape as a server action, (previous state,
// form data) => next state, so the forms keep using useKeepingForm unchanged. Large bodies cannot go through server actions
// (their body limit is small, see next.config.ts), so the file travels in a plain fetch POST and the form follows the
// answer: it shows the returned state, or opens the page the server asked for.

export type UploadFallback<State> = {
  /** State to show when the server says the files are too large (HTTP 413). */
  tooLarge: State;
  /** State to show when the request fails (offline, server error). */
  failed: State;
};

type UploadAnswer<State> = { state?: State; redirectTo?: string };

export function makeUploadAction<State extends { status: string }>(kind: string, fallback: UploadFallback<State>) {
  return async function upload(_previous: State, form: FormData): Promise<State> {
    let response: Response;
    try {
      response = await fetch(`/api/uploads/${kind}`, { method: "POST", body: form, credentials: "same-origin" });
    } catch {
      return fallback.failed;
    }
    let answer: UploadAnswer<State> = {};
    try {
      answer = (await response.json()) as UploadAnswer<State>;
    } catch {
      // Not JSON (a proxy error page, for example): fall through to the status below.
    }
    if (answer.redirectTo && answer.redirectTo.startsWith("/") && !answer.redirectTo.startsWith("//")) {
      // A full page load, so every page shows the new data (the server already refreshed its caches). Also how an
      // expired session reaches the sign-in page: the server answers 401 with redirectTo.
      window.location.assign(answer.redirectTo);
      // Keep the form "sending" until the browser leaves, so the button cannot be pressed twice in between.
      return new Promise<State>(() => {});
    }
    if (response.status === 413) return answer.state ?? fallback.tooLarge;
    return answer.state ?? fallback.failed;
  };
}
