import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Eventgate Scanner",
    short_name: "Scanner",
    description: "Door-day check-in for Eventgate events",
    start_url: "/scanner/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      // Placeholder — branded icons land in Plan H (pre-pilot QA).
      // favicon.ico is included so the manifest validates and "Install to home
      // screen" prompts work even without dedicated PWA icons yet.
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
