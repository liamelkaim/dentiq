import type { MetadataRoute } from "next";

// Lets students add Dentiq to their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dentiq",
    short_name: "Dentiq",
    description: "La plateforme d'étude des étudiants en médecine dentaire",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    lang: "fr",
    // Generated from the approved brand-kit icon (public/brand/dentiq-icon.png).
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
