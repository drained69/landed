import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "./fonts/hanken-grotesk.woff2", variable: "--font-hanken", weight: "100 900", display: "swap" });
const hand = localFont({ src: "./fonts/shantell-sans.woff2", variable: "--font-shantell", weight: "300 800", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono.woff2", variable: "--font-jetbrains", weight: "100 800", display: "swap" });

export const metadata: Metadata = {
  title: "LANDED — money that remembers",
  description:
    "LANDED connects your cash flow, ranks real payment routes, and learns from confirmed outcomes with persistent Walrus memory.",
  applicationName: "LANDED",
  openGraph: {
    title: "LANDED — money that remembers",
    description: "Safe-to-move cash, route intelligence, and advice that gets better after every outcome.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f4",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${sans.variable} ${hand.variable} ${mono.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
