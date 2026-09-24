import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A restored production cache served old CSS after an OAuth UI update.
  // Compile fresh assets so published indicators match the current source.
  experimental: { turbopackFileSystemCacheForBuild: false },
};

export default nextConfig;
