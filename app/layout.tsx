import type { Metadata } from "next";
import "./globals.css";
import { NoiseLayer } from "./components/system/NoiseLayer";

export const metadata: Metadata = {
  title: "Hearst",
  description: "Hearst — votre assistant intelligent",
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
