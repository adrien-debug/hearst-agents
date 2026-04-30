// lint-visual-disable-file
// Couleur theme hex requise par la spec PWA (Web App Manifest /
// meta theme-color). Pas un magic number CSS — opt-out légitime.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NoiseLayer } from "./components/system/NoiseLayer";

export const metadata: Metadata = {
  title: "Hearst",
  description: "Hearst — votre assistant intelligent",
  applicationName: "Hearst OS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hearst",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark h-full antialiased">
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi-variable@900,700,500,400,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full text-[var(--text)] overflow-hidden">
        <div className="ghost-bg" />
        {children}
        <NoiseLayer />
      </body>
    </html>
  );
}
