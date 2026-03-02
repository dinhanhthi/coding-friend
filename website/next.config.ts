import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

const pluginMeta = JSON.parse(
  readFileSync(
    resolve(__dirname, "../plugin/.claude-plugin/plugin.json"),
    "utf-8",
  ),
);

const nextConfig: NextConfig = {
  trailingSlash: true,
  cacheComponents: true,
  reactCompiler: true,
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_PLUGIN_VERSION: pluginMeta.version,
  },
};

export default nextConfig;
