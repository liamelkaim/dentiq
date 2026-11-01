# Installable app and offline shell

Dentiq can be added to a phone's home screen and shows a clear page when the network is down. It is **not** an offline
study app: lessons, exam questions, notes, documents and progress always need a connection.

## What is installable

- `src/app/manifest.ts` serves `/manifest.webmanifest`: name and short name "Dentiq", `start_url` `/`, `display: standalone`,
  French default (`lang: "fr"`), and the three existing icons (192, 512, 512 maskable in `public/`). `background_color` and
  `theme_color` are the dark navy of the brand (`--bg` in `.dark`; a manifest has one value). The light and dark browser-bar
  colors are set per color scheme by the `viewport` export in `src/app/layout.tsx`.
- Icons are the existing files generated from the approved brand icon. They were not redrawn (no high-resolution logo exists yet).
- Whether a given browser offers "Install" or only "Add to home screen" depends on the browser and cannot be tested here.

## What the service worker caches

`public/sw.js` is registered by `src/components/service-worker-register.tsx`, **in production only**. Its cache
(`dentiq-shell-v1`) holds exactly this fixed list of public files and nothing else:

| Cached | Why |
| --- | --- |
| `/offline.html` (also reachable as `/offline`) | Shown when a page cannot be loaded |
| `/manifest.webmanifest` | Public metadata |
| `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` | App icons |
| `/brand/dentiq-icon.png` | Logo shown on the offline page |

## What it never caches

- Pages (HTML) of any kind, signed in or not. Page navigations always go to the network; the response is handed back untouched
  and is not stored. If the network fails, the offline page is shown instead.
- Anything under `/api/` (sign-in session, uploaded documents `/api/files/`, question images, exports, auth).
- `/_next/` scripts, styles and data, server action requests (POST), any request to another site, any URL with a query string.
- Uploaded files, question images, notes, flashcards, quiz results, calendar entries: none of it is written to the device by
  the service worker. A shared or lost phone therefore does not carry study material or a session in the cache.

`tests/platform-quality.test.ts` runs `public/sw.js` against a fake worker scope and checks that private URLs are not handled,
that nothing is written to the cache while fetching, and that the precache list is exactly the table above.

## Updating it

Bump `CACHE_VERSION` in `public/sw.js` when the list changes; the next visit installs the new worker and deletes older
`dentiq-shell-*` caches. `/sw.js` is served with `Cache-Control: public, max-age=0, must-revalidate` so browsers re-check it.
To remove the feature, do not just delete `public/sw.js`: visitors would keep the old worker. Replace it with a worker that
calls `self.registration.unregister()` first, then remove `ServiceWorkerRegister`.

## The offline page

`public/offline.html` is static so the worker can cache it. It cannot import `globals.css` or `fr.json`/`en.json`, so it
carries copies of the design tokens it uses (a test fails if they drift from `globals.css`) and its French and English text
inline. It picks the language from the `DENTOS_LOCALE` cookie, then the browser language, then French, and the theme from
the saved Dentiq theme. This is the one place where UI text is not in the message files. It says plainly that study content
needs a connection and offers a "Try again" button; it does not claim the app works offline.

## Not verified without a browser

Install prompt behavior on Android and iOS, the standalone display, safe-area appearance on a notched phone, the worker
actually registering and the offline page appearing with the network off.
