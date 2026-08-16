import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/jobs": ["./imports/workbuddy/offerstar/offerstar-jobs.json"],
  },
};

export default nextConfig;
