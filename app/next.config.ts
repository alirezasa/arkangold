import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── PWA / Service Worker ─────────────────────────────────────
  // The sw.js is in /public so it's served at the root scope.
  // No extra config needed unless you use next-pwa package.

  // ── Security headers ─────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow the app to be installed as PWA in iOS Safari
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Service worker must be served with correct MIME type
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Manifest
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },

  // ── Images ──────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // ── Compression ─────────────────────────────────────────────
  compress: true,

  // ── Strict mode ─────────────────────────────────────────────
  reactStrictMode: true,
};

export default nextConfig;
