import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  agentRules: false,
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  outputFileTracingExcludes: { "/*": ["../../asset-library/subjects/**/*", "../../asset-library/dist/**/*", "../../asset-library/shared/**/*"] },
  serverExternalPackages: ["@worldkit/asset-library"],
  async redirects() {
    return ["/viewer", "/viewer/index.html"].map(source => ({ source, destination: "/", permanent: false }));
  },
  async rewrites() {
    return ["/v1/:path*", "/registry.json", "/releases/:path*", "/indexes/:path*", "/manifests/:path*", "/artifacts/:path*"].map(source => ({ source, destination: "/api/registry" + source }));
  },
};
export default config;
