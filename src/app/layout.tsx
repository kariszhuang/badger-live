import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Badger Live — Find your next campus moment",
  description: "Explore real public UW–Madison events on a living campus map. Independent student project.",
  applicationName: "Badger Live",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#c5050c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={geist.variable}><body>{children}</body></html>;
}
