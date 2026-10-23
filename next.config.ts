import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // lets phones on the LAN load dev assets (e.g. http://192.168.2.19:3000/join)
  allowedDevOrigins: ["192.168.*.*"],
  // lets a production build run alongside `next dev` (e.g. NEXT_DIST_DIR=.next-prod)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // nothing here is meant to be framed; stops clickjacking of /admin
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
