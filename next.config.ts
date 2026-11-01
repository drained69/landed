import type { NextConfig } from "next";

// Baseline security headers for a financial app. No CSP yet: Next's inline
// bootstrap scripts would need per-request nonces first.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The same Tailwind loader is needed for explicit `next build --webpack`.
  // Without it webpack compiles successfully but omits all utility classes.
  webpack(config) {
    config.module.rules.push({ test: /globals\.css$/, use: [{ loader: "@tailwindcss/turbopack" }] });
    return config;
  },
  // LANDED is a session-scoped financial app: every screen reads the
  // authenticated user's live records. Cache Components' static-shell
  // validation adds no value here, so the app renders per request instead.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
