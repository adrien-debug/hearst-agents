import type { MetadataRoute } from "next";

/**
 * PWA Manifest — Hearst OS Mobile companion (C8).
 *
 * Convention Next.js : ce fichier est servi automatiquement à `/manifest.webmanifest`.
 * Source de vérité unique pour : nom, theme, icons, shortcuts (long-press homescreen).
 *
 * Couleurs : background_color = --bg (#000000), theme_color = --cykan (#2DD4BF).
 * Garder en sync avec les tokens app/globals.css.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hearst OS",
    short_name: "Hearst",
    description: "Cockpit IA pour founders — voice-first quick access et offline reading",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#2DD4BF",
    orientation: "portrait-primary",
    categories: ["productivity", "business"],
    lang: "fr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Voice ambient",
        short_name: "Voice",
        url: "/?stage=voice",
        description: "Ouvrir la session voix ambient direct",
      },
      {
        name: "Cockpit",
        short_name: "Cockpit",
        url: "/?stage=cockpit",
        description: "Briefing du jour + missions",
      },
      {
        name: "Missions",
        short_name: "Missions",
        url: "/missions",
        description: "Mission Control",
      },
    ],
  };
}
