import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
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
