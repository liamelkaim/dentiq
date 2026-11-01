import type { MetadataRoute } from "next";

// Lets students add Dentiq to their phone's home screen. The manifest has one theme color, so it uses the dark navy of the
// brand (the --bg token in .dark); the light and dark browser-bar colors are set per color scheme in the root layout's
// `viewport` export. tests/platform-quality.test.ts checks these values against src/app/globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dentiq",
    short_name: "Dentiq",
    description: "La plateforme d'étude des étudiants en médecine dentaire",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    lang: "fr",
    dir: "ltr",
    categories: ["education"],
    // Generated from the approved brand-kit icon (public/brand/dentiq-icon.png).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
