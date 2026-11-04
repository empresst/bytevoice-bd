import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The portal is per-user and always dynamic, so Cache Components stays off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
