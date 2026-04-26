import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { NoiseLayer } from "./components/system/NoiseLayer";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="fr"
      className={`dark ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,300,400&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full text-[var(--text)] font-satoshi overflow-hidden">
        <div className="ghost-bg" />
        {children}
        <NoiseLayer />
      </body>
    </html>
  );
}
