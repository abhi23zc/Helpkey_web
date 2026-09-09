import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, traced Node runtime for the production Docker image.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
