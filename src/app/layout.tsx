import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  themeColor: "#080a08",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
