import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  },
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: "/_next/static/media/:path*"
      }
    ];
  }
};

export default nextConfig;
