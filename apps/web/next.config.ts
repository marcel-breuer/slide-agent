import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@slide-agent/ai-core",
    "@slide-agent/ai-providers",
    "@slide-agent/auth",
    "@slide-agent/editor-core",
    "@slide-agent/i18n",
    "@slide-agent/presentation-renderer",
    "@slide-agent/presentation-schema",
    "@slide-agent/pricing",
    "@slide-agent/shared"
  ],
  typedRoutes: true
};

export default nextConfig;
