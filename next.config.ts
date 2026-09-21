import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, traced Node runtime for the production Docker image.
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
