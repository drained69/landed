import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
