import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. This exists so that a spectator who has
 * scanned the QR code on the table can keep the programme on their home screen
 * for the night, and get it back without the browser furniture.
 *
 * The maskable icons are a separate pair rather than the same files declared
 * twice: Android crops a maskable icon to whatever shape the launcher uses, so
 * they are full-bleed with the mark inside the safe area, where the "any" icons
 * keep their own rounded corners.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EventIQ — digital fight programmes",
    short_name: "EventIQ",
    description:
      "One code on the table puts the whole card on every phone in the building: every bout with a tale of the tape, every fighter with a story, every sponsor seen.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07080a",
    theme_color: "#07080a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
