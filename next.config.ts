import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/favicon.ico", destination: "/logo-ha-hoa.jpg" },
    ];
  },
};

export default nextConfig;
