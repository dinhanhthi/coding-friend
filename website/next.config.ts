import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
);

const nextConfig: NextConfig = {
  trailingSlash: true,
  cacheComponents: true,
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_PLUGIN_VERSION: rootPkg.version,
  },
};

export default nextConfig;
