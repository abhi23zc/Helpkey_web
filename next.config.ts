import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.HELPKEY_TEST_DIST_DIR || ".next",
  // Produces a minimal, traced Node runtime for the production Docker image.
  output: "standalone",
  // BullMQ selects optional Redis backends at runtime; keep its Node entrypoint intact.
  serverExternalPackages: ["bullmq", "ioredis"],
  // Keep full type checking without relying on subprocess --showConfig output.
  experimental: { useTypeScriptCli: false },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
