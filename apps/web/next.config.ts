import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@slide-agent/ai-core",
    "@slide-agent/auth",
    "@slide-agent/i18n",
    "@slide-agent/presentation-renderer",
    "@slide-agent/presentation-schema",
    "@slide-agent/pricing",
    "@slide-agent/shared"
  ],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
