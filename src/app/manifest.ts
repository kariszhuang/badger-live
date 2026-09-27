import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Badger Live", short_name: "Badger Live", description: "The living map of UW–Madison events", start_url: "/", display: "standalone", background_color: "#f7f6f2", theme_color: "#c5050c",
    icons: [
      { src: "/icons/badger-live-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/badger-live-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
