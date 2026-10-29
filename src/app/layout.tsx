import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Shantell_Sans } from "next/font/google";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const hand = Shantell_Sans({ subsets: ["latin"], variable: "--font-shantell", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

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
