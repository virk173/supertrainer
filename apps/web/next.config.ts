import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript — Next transpiles them.
  transpilePackages: ["@supertrainer/ai", "@supertrainer/db", "@supertrainer/ui"],
  // Monorepo root — stops Next inferring it from stray lockfiles outside the repo.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
