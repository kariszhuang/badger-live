import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
  agentRules: false,
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "mapcdn.wisc.cloud",
      pathname: "/rails/active_storage/blobs/proxy/**",
    }],
  },
};

export default nextConfig;
