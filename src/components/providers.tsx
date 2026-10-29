"use client";

import { ThemeProvider } from "next-themes";

/** Theme choice (light / dark / system) is saved in localStorage by next-themes. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="dentos-theme">
      {children}
    </ThemeProvider>
  );
}
