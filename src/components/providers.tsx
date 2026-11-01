"use client";

import { ThemeProvider } from "next-themes";

/** Theme choice (light / dark / system) is saved in localStorage by next-themes. */
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="dentos-theme" nonce={nonce}>
      {children}
    </ThemeProvider>
  );
}
