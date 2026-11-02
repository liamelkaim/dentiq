import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { API_CSP, buildCsp, buildHeaderRules, buildNonceCsp, createNonce } from "@/lib/security-headers";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => path.relative(ROOT, f);

/** Source with comments removed, so a rule about UI copy does not trip over developer notes. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[\s;,{(])\/\/.*$/, "$1"))
    .join("\n");
}

function strings(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

// ---------- Copy rules ----------

describe("copy rules", () => {
  it("has no em dash or en dash in any message, French or English", () => {
    const offenders = [...strings(fr, "fr"), ...strings(en, "en")].filter(([, text]) => /[—–]/.test(text)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it("has no em dash or en dash in rendered strings of the code (comments are fine)", () => {
    const offenders = sourceFiles.filter((f) => /[—–]/.test(withoutComments(readFileSync(f, "utf8")))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("uses no emoji or glyph characters as icons", () => {
    // Check marks, crosses, arrows, dingbats, geometric shapes, multiplication sign, bullets and emoji planes.
    const glyphs = /[←-⇿☀-➿×•■-◿⬀-⯿\u{1F000}-\u{1FFFF}]/u;
    const offenders = sourceFiles.filter((f) => glyphs.test(withoutComments(readFileSync(f, "utf8")))).map(rel);
    expect(offenders).toEqual([]);
  });
});

// ---------- Placeholders and links ----------

/** Maps a src/app route file to a list of path segments; dynamic segments become "*". */
function routePatterns(): string[][] {
  return walk(path.join(SRC, "app"))
    .filter((f) => /[\\/](page\.tsx|route\.ts)$/.test(f))
    .map((f) =>
      path
        .relative(path.join(SRC, "app"), path.dirname(f))
        .split(path.sep)
        .filter((s) => s && !/^\(.*\)$/.test(s))
        .map((s) => (s.startsWith("[...") ? "**" : s.startsWith("[") ? "*" : s)),
    );
}

const publicFiles = new Set(readdirSync(path.join(ROOT, "public"), { recursive: true }).map((f) => "/" + String(f)));

function matchesRoute(pathname: string, patterns: string[][]): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return patterns.some((pattern) => {
    if (pattern.includes("**")) return parts.length >= pattern.indexOf("**") && pattern.slice(0, pattern.indexOf("**")).every((p, i) => p === parts[i] || p === "*");
    return pattern.length === parts.length && pattern.every((p, i) => p === "*" || p === parts[i]);
  });
}

/** Internal link targets written as literals: href="/x", href={`/x/${id}`}, href: "/x", redirect("/x"), push("/x"). */
function internalTargets(source: string): string[] {
  const code = withoutComments(source);
  const found: string[] = [];
  const patterns = [
    /href=\{?\s*(["'`])(\/[^"'`]*)\1/g,
    /href:\s*(["'`])(\/[^"'`]*)\1/g,
    /\b(?:redirect|push|replace)\(\s*(["'`])(\/[^"'`]*)\1/g,
    /(?:const|let)\s+(?:base|hrefBase)\s*=\s*(["'`])(\/[^"'`]*)\1/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[2]!);
  // The course header builds its tabs from `${base}/...`; `base` is a course page.
  for (const m of code.matchAll(/href:\s*`\$\{base\}([^`]*)`/g)) found.push("/courses/x" + m[1]);
  return found;
}

/** `/a/${id}/b${query}?x=1#y` becomes `/a/x/b`: whole-segment expressions are dynamic, trailing ones are query strings. */
function normalize(target: string): string {
  return target
    .split(/[?#]/)[0]!
    .split("/")
    .map((seg) => (/^\$\{[^}]*\}$/.test(seg) ? "x" : seg.replace(/\$\{[^}]*\}/g, "")))
    .join("/");
}

describe("navigation", () => {
  const patterns = routePatterns();
  const appFiles = sourceFiles.filter((f) => /\.tsx$/.test(f) && (f.includes(`${path.sep}app${path.sep}`) || f.includes(`${path.sep}components${path.sep}`)));

  it("finds the route files", () => {
    expect(patterns.length).toBeGreaterThan(40);
    expect(matchesRoute("/", patterns)).toBe(true);
    expect(matchesRoute("/courses/DEMO%201001/notes", patterns)).toBe(true);
    expect(matchesRoute("/no/such/page", patterns)).toBe(false);
  });

  it("every literal internal link in pages and components points to an existing route", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const file of appFiles) {
      for (const target of internalTargets(readFileSync(file, "utf8"))) {
        const pathname = normalize(target);
        checked += 1;
        if (!matchesRoute(pathname, patterns) && !publicFiles.has(pathname)) broken.push(`${rel(file)}: ${target}`);
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(broken).toEqual([]);
  });

  it("every main navigation entry exists (sidebar, phone tab bar, header, Study hub, course tabs)", () => {
    const shell = readFileSync(path.join(SRC, "components", "app-shell.tsx"), "utf8");
    const hub = readFileSync(path.join(SRC, "app", "(app)", "practice", "page.tsx"), "utf8");
    const course = readFileSync(path.join(SRC, "components", "course-layout.tsx"), "utf8");
    const targets = [...internalTargets(shell), ...internalTargets(hub), ...internalTargets(course)].map(normalize);
    for (const must of ["/", "/courses", "/resources", "/passes", "/practice", "/calendar", "/analytics", "/tutor", "/moderation", "/admin", "/settings", "/profile", "/practice/flashcards", "/practice/quizzes", "/practice/progress", "/practice/export", "/practice/questions"]) {
      expect(targets, must).toContain(must);
    }
    for (const t of targets) expect(matchesRoute(t, patterns), t).toBe(true);
  });

  it("only features that do not exist are labelled soon", () => {
    // Everything in the menu exists. Recordings is built but OFF by default, so its menu item is conditional.
    const list = (file: string, name: string) => {
      const source = readFileSync(path.join(SRC, "components", file), "utf8");
      const body = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))?.[1] ?? "";
      return [...body.matchAll(/key:\s*"(\w+)"/g)].map((m) => m[1]);
    };
    // The sidebar hides unbuilt features entirely (no "coming soon" list); course tabs still show a disabled one.
    expect(list("app-shell.tsx", "comingSoon")).toEqual([]);
    expect(list("course-layout.tsx", "futureTabs")).toEqual([]);
    expect(existsSync(path.join(SRC, "app", "(app)", "recordings"))).toBe(true);
    expect(readFileSync(path.join(SRC, "components", "app-shell.tsx"), "utf8")).toMatch(/recordingsOn \? \[\{ href: "\/recordings"/);
  });
});

// ---------- PWA, viewport ----------

function cssToken(block: "root" | "dark", name: string): string {
  const css = read("src", "app", "globals.css");
  const start = block === "root" ? css.indexOf(":root {") : css.indexOf(".dark {");
  const end = css.indexOf("}", start);
  const value = css.slice(start, end).match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`token --${name} not found in ${block}`);
  return value.trim();
}

describe("manifest and viewport", () => {
  const m = manifest();

  it("describes an installable standalone app in French with the existing icons", () => {
    expect(m.name).toBe("Dentiq");
    expect(m.short_name).toBe("Dentiq");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("fr");
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes}:${i.purpose}`).sort()).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of icons) expect(existsSync(path.join(ROOT, "public", icon.src)), icon.src).toBe(true);
  });

  it("takes its colors from the design tokens", () => {
    expect(m.background_color).toBe(cssToken("dark", "bg"));
    expect(m.theme_color).toBe(cssToken("dark", "bg"));
    const layout = read("src", "app", "layout.tsx");
    expect(layout).toContain(`media: "(prefers-color-scheme: light)", color: "${cssToken("root", "bg")}"`);
    expect(layout).toContain(`media: "(prefers-color-scheme: dark)", color: "${cssToken("dark", "bg")}"`);
  });

  it("lets people zoom and uses the full screen with safe areas", () => {
    const layout = read("src", "app", "layout.tsx");
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('width: "device-width"');
    expect(layout).toContain("initialScale: 1");
    expect(layout).not.toMatch(/maximumScale|userScalable|maximum-scale|user-scalable/);
    const shell = read("src", "components", "app-shell.tsx");
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(shell).toContain("env(safe-area-inset-top)");
    // The page bottom padding must include the safe area so content clears the tab bar.
    expect(shell).toMatch(/pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/);
  });
});

// ---------- Offline shell ----------

type FetchEvent = { request: { method: string; url: string; mode: string }; respondWith: (p: unknown) => void; responded?: boolean };

/** Runs public/sw.js against a fake worker scope and returns what it did. */
function loadServiceWorker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, Set<string>>();
  const writes: string[] = [];
  const caches = {
    open: async (name: string) => {
      if (!stored.has(name)) stored.set(name, new Set());
      return {
        addAll: async (urls: string[]) => urls.forEach((u) => stored.get(name)!.add(u)),
        put: async (request: unknown) => writes.push(String(request)),
        add: async (url: string) => writes.push(url),
      };
    },
    keys: async () => [...stored.keys()],
    delete: async (name: string) => stored.delete(name),
    match: async (url: string) => (url === "/offline.html" || [...stored.values()].some((s) => s.has(new URL(url, "https://dentiq.test").pathname)) ? { cached: url } : undefined),
  };
  const fetched: string[] = [];
  const scope = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    location: { origin: "https://dentiq.test" },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const context = {
    self: scope,
    caches,
    URL,
    Response: { error: () => ({ error: true }) },
    fetch: async (request: { url: string }) => {
      fetched.push(request.url);
      throw new Error("offline");
    },
  };
  vm.runInNewContext(read("public", "sw.js"), context);
  const fetchEvent = (url: string, init: Partial<FetchEvent["request"]> = {}) => {
    const event: FetchEvent = { request: { method: "GET", url, mode: "no-cors", ...init }, respondWith: (p) => {
        Promise.resolve(p).catch(() => {});
        event.responded = true;
      },
    };
    listeners.fetch!(event);
    return event;
  };
  const install = async () => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.install!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { fetchEvent, install, stored, writes, fetched };
}

describe("service worker (offline-safe shell)", () => {
  it("precaches only the fixed list of public static files", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    const cached = [...sw.stored.values()].flatMap((s) => [...s]).sort();
    expect(cached).toEqual(["/brand/dentiq-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/manifest.webmanifest", "/offline.html"]);
    for (const url of cached) expect(url).not.toMatch(/api|auth|files|question|export/);
    for (const url of cached) {
      const file = url === "/manifest.webmanifest" ? path.join(SRC, "app", "manifest.ts") : path.join(ROOT, "public", url);
      expect(existsSync(file), url).toBe(true);
    }
  });

  it("never handles private or dynamic requests, and never writes to the cache while fetching", () => {
    const sw = loadServiceWorker();
    for (const url of [
      "https://dentiq.test/api/files/abc?inline=1",
      "https://dentiq.test/api/question-images/abc",
      "https://dentiq.test/api/auth/get-session",
      "https://dentiq.test/api/study-export?format=csv",
      "https://dentiq.test/profile/export",
      "https://dentiq.test/_next/static/chunks/app.js",
      "https://dentiq.test/icon-192.png?token=1",
      "https://other.example.com/icon-192.png",
    ]) {
      expect(sw.fetchEvent(url).responded, url).toBeUndefined();
    }
    expect(sw.fetchEvent("https://dentiq.test/api/files/abc", { method: "POST" }).responded).toBeUndefined();
    expect(sw.writes).toEqual([]);
  });

  it("serves allowlisted shell files from the cache and shows the offline page for failed navigations", () => {
    const sw = loadServiceWorker();
    expect(sw.fetchEvent("https://dentiq.test/icon-192.png").responded).toBe(true);
    expect(sw.fetchEvent("https://dentiq.test/courses", { mode: "navigate" }).responded).toBe(true);
    expect(sw.writes).toEqual([]);
  });

  it("source never stores network responses", () => {
    const source = withoutComments(read("public", "sw.js"));
    expect(source).not.toMatch(/\.put\(|cache\.add\(|clone\(\)/);
    expect(source).toContain("event.respondWith(fetch(request)");
  });

  it("registers only in production, from a client component", () => {
    const source = read("src", "components", "service-worker-register.tsx");
    expect(source.startsWith('"use client"')).toBe(true);
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('register("/sw.js"');
    expect(read("src", "app", "layout.tsx")).toContain("<ServiceWorkerRegister />");
  });

  it("offline page has both languages, no external resources and copies of the design tokens", () => {
    const html = read("public", "offline.html");
    expect(html).toContain('data-lang="fr"');
    expect(html).toContain('data-lang="en"');
    expect(html).not.toMatch(/(?:src|href)=["']https?:/);
    expect(html).not.toMatch(/[—–]/);
    const lightBlock = html.match(/:root \{([^}]*)\}/)![1]!;
    const darkBlock = html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)![1]!;
    const pick = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
    for (const name of ["bg", "surface", "border", "text", "text-muted", "accent-solid", "accent-solid-hover", "on-accent", "focus"]) {
      expect(pick(lightBlock, name), `light --${name}`).toBe(cssToken("root", name));
    }
    for (const name of ["bg", "surface", "border", "text", "text-muted", "focus"]) {
      expect(pick(darkBlock, name), `dark --${name}`).toBe(cssToken("dark", name));
    }
  });
});

// ---------- Headers ----------

describe("security headers", () => {
  const rules = buildHeaderRules({ production: true });
  const ruleWith = (predicate: (source: string) => boolean) => rules.find((r) => predicate(r.source) && r.headers.some((h) => h.key === "Content-Security-Policy"))!;
  const nonce = createNonce();
  const csp = buildNonceCsp(nonce);

  it("restricts everything to this origin and forbids plugins, framing and foreign forms", () => {
    for (const policy of [csp, buildCsp()]) {
      for (const directive of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "img-src 'self' data: blob:", "frame-src 'self'", "worker-src 'self'"]) {
        expect(policy).toContain(directive);
      }
      expect(policy).not.toMatch(/https?:|\*/);
    }
  });

  it("page policy: scripts need the per-request nonce, no unsafe-inline for scripts, eval only in development", () => {
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(script).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildNonceCsp(nonce, { dev: true })).toContain("'unsafe-eval'");
    // A nonce in style-src would make browsers ignore 'unsafe-inline' and break style attributes.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/style-src[^;]*nonce/);
  });

  it("makes a new unpredictable nonce for every request", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("the proxy puts the nonce policy on the request (for Next.js) and the response (for the browser)", () => {
    const proxy = read("src", "proxy.ts");
    expect(proxy).toContain("buildNonceCsp(nonce");
    expect(proxy).toContain('requestHeaders.set("x-nonce", nonce)');
    expect(proxy).toContain('requestHeaders.set("Content-Security-Policy", policy)');
    expect(proxy).toContain('response.headers.set("Content-Security-Policy", policy)');
    // Not for API routes, static assets, prefetches or server-action posts.
    for (const skipped of ["api/", "_next/static", "sw.js", "offline", "next-router-prefetch", "next-action"]) expect(proxy).toContain(skipped);
    // The layout hands the nonce to next-themes (its inline script).
    expect(read("src", "app", "layout.tsx")).toContain('get("x-nonce")');
    expect(read("src", "components", "providers.tsx")).toContain("nonce={nonce}");
  });

  it("static policies: no inline scripts for API routes, a fixed policy for the offline page, none duplicated on files and images", () => {
    const api = ruleWith((s) => s.startsWith("/api/"));
    expect(api.headers.find((h) => h.key === "Content-Security-Policy")!.value).toBe(API_CSP);
    expect(API_CSP).toContain("default-src 'none'");
    expect(ruleWith((s) => s === "/offline").headers.find((h) => h.key === "Content-Security-Policy")!.value).toBe(buildCsp());
    // Pages never get a static policy from next.config (the proxy sets theirs): no catch-all CSP rule.
    expect(rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy")).map((r) => r.source)).toEqual([api.source, "/offline", "/offline.html"]);
  });

  it("leaves /api/files and /api/question-images to set their own headers", () => {
    const api = ruleWith((s) => s.startsWith("/api/"));
    expect(api.source).toContain("files/");
    expect(api.source).toContain("question-images/");
    const source = new RegExp(`^${api.source}$`);
    expect(source.test("/api/files/abc")).toBe(false);
    expect(source.test("/api/question-images/abc")).toBe(false);
    expect(source.test("/api/study-export")).toBe(true);
    const file = read("src", "app", "api", "files", "[versionId]", "route.ts");
    expect(file).toContain("frame-ancestors 'self'");
  });

  it("adds Strict-Transport-Security only in production", () => {
    const has = (production: boolean) => buildHeaderRules({ production }).some((r) => r.headers.some((h) => h.key === "Strict-Transport-Security"));
    expect(has(true)).toBe(true);
    expect(has(false)).toBe(false);
  });

  it("is wired into next.config.ts", () => {
    const config = read("next.config.ts");
    expect(config).toContain("buildHeaderRules");
    expect(config).toContain('"/offline"');
  });
});

// ---------- Keyboard, focus, motion, touch targets, error states ----------

describe("accessibility basics", () => {
  const css = read("src", "app", "globals.css");

  it("has a global visible focus ring from a token", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
  });

  it("disables animation, transitions and smooth scrolling for reduced motion", () => {
    const block = css.slice(css.indexOf("prefers-reduced-motion: reduce"));
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
    expect(block).toContain("scroll-behavior: auto !important");
  });

  it("never removes an outline without a replacement", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles.filter((f) => f.endsWith(".tsx"))) {
      const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (!/outline-none/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
        // Allowed: a focus-visible outline on the same element, or a programmatic focus target (tabIndex -1, not a control).
        if (/focus-visible:outline/.test(line) || /tabIndex=\{-1\}/.test(context)) return;
        offenders.push(`${rel(file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("main content is a focus target for the skip link on every layout", () => {
    for (const file of [["components", "app-shell.tsx"], ["components", "study-mode.tsx"], ["app", "(auth)", "layout.tsx"], ["app", "(legal)", "layout.tsx"]]) {
      const source = read("src", ...file);
      expect(source, file.join("/")).toMatch(/id="main"[\s\S]{0,40}tabIndex=\{-1\}/);
    }
    for (const file of [["components", "app-shell.tsx"], ["app", "(auth)", "layout.tsx"], ["app", "(legal)", "layout.tsx"]]) {
      expect(read("src", ...file), file.join("/")).toContain("<SkipLink");
    }
  });

  it("keeps 44 px touch targets on phones for the shared controls", () => {
    const ui = read("src", "components", "ui.tsx");
    expect(ui).toMatch(/md: "h-11 /);
    expect(ui).toMatch(/sm: "h-11 /);
    expect(ui).toContain('cx(controlBase, "h-11 sm:h-10", className)');
    expect(ui).toContain('"h-11 appearance-auto pr-8 text-ellipsis sm:h-10"');
    const shell = read("src", "components", "app-shell.tsx");
    expect(shell).not.toMatch(/size-10 place-items-center/);
    const prefs = read("src", "components", "preferences.tsx");
    expect(prefs).toContain("h-11");
  });

  it("has loading, error, not-found and forbidden screens that never print internal messages", () => {
    for (const file of ["app/error.tsx", "app/global-error.tsx", "app/not-found.tsx", "app/forbidden.tsx", "app/(app)/error.tsx", "app/(app)/loading.tsx", "app/(app)/practice/loading.tsx", "app/(app)/analytics/loading.tsx", "app/(app)/calendar/loading.tsx", "app/(app)/tutor/loading.tsx", "app/(app)/search/loading.tsx"]) {
      expect(existsSync(path.join(SRC, file)), file).toBe(true);
    }
    for (const file of ["app/error.tsx", "app/global-error.tsx", "app/(app)/error.tsx"]) {
      const source = withoutComments(read("src", file));
      expect(source.startsWith('"use client"'), file).toBe(true);
      expect(source, file).not.toMatch(/error\.(message|stack)|String\(error\)|JSON\.stringify\(error/);
      expect(source, file).toContain('role="alert"');
    }
    expect(read("src", "components", "loading-ui.tsx")).toContain('aria-busy="true"');
  });

  it("has error texts in both languages for the screens above", () => {
    for (const messages of [fr, en]) {
      for (const key of ["notFoundTitle", "notFoundBody", "forbiddenTitle", "forbiddenBody", "errorTitle", "errorBody", "reference", "goHome"] as const) {
        expect(messages.errors[key], key).toBeTruthy();
      }
      expect(messages.common.retry).toBeTruthy();
    }
  });
});

// ---------- Browser test findings (block I part 2) ----------

describe("browser test findings", () => {
  const css = read("src", "app", "globals.css");

  function tokens(selector: ":root" | ".dark"): Record<string, string> {
    const start = css.indexOf(`${selector} {`);
    const block = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
  }
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it("keeps muted, subtle and accent text at 4.5:1 on every surface, in both themes", () => {
    for (const theme of [":root", ".dark"] as const) {
      const t = tokens(theme);
      for (const text of ["text", "text-muted", "text-subtle", "accent"]) {
        for (const surface of ["bg", "surface", "surface-muted"]) {
          expect(contrast(t[text]!, t[surface]!), `${theme} ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("never suppresses the focus ring of a control (inputs, selects, buttons)", () => {
    const offenders = sourceFiles
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .filter((f) => /focus:outline-none/.test(withoutComments(readFileSync(f, "utf8"))))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("gives keyboard focus back to the submit button after a form action settles", () => {
    const hook = read("src", "components", "use-keeping-form.ts");
    expect(hook).toContain("submitterRef");
    expect(hook).toMatch(/button\.focus\(/);
  });

  it("lets a single-column grid shrink: responsive grids start from grid-cols-1", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles.filter((f) => f.endsWith(".tsx"))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/className="[^"]*\bgrid gap-/.test(line) && /(sm|md|lg|xl|2xl):grid-cols/.test(line) && !line.includes("grid-cols-1")) offenders.push(`${rel(file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps footer and switcher links at least 44 px wide on phones", () => {
    for (const file of [["components", "site-footer.tsx"], ["components", "app-shell.tsx"]]) {
      expect(read("src", ...file), file.join("/")).toContain("min-w-11");
    }
    expect(read("src", "components", "preferences.tsx")).toContain("min-w-11");
  });

  it("titles the 404 and 403 pages", () => {
    for (const file of ["not-found.tsx", "forbidden.tsx"]) expect(read("src", "app", file), file).toContain("generateMetadata");
  });
});
