import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["100.117.21.47", "192.168.1.67", "cdjk", "cdjk.fell-truck.ts.net"],
  async rewrites() {
    // In Docker/production, Traefik routes /api/* to backend directly.
    // Rewrites only needed for local dev without Traefik.
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:5001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
