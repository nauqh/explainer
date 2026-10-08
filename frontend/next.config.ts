import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The floating dev badge sat over the bottom of the lesson; errors still show in development.
  devIndicators: false,
  partialPrefetching: true,
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
