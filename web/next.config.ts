import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A restored production cache served old CSS after an OAuth UI update.
  // Compile fresh assets so published indicators match the current source.
  experimental: { turbopackFileSystemCacheForBuild: false },
  outputFileTracingIncludes: {
    "/api/assistant/search": ["./worker/document-worker.mjs", "./node_modules/pdfjs-dist/legacy/build/*", "./node_modules/pdfjs-dist/package.json", "./node_modules/@napi-rs/canvas*/**/*"],
  },
};

export default nextConfig;
