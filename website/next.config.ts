import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

const pluginMeta = JSON.parse(
  readFileSync(
    resolve(__dirname, "../plugin/.claude-plugin/plugin.json"),
    "utf-8",
  ),
);

const cliMeta = JSON.parse(
  readFileSync(resolve(__dirname, "../cli/package.json"), "utf-8"),
);

// Static export for GitHub Pages: legacy /docs and /changelog redirects live in src/app/not-found.tsx.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactCompiler: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.md": {
        loaders: [resolve(__dirname, "loaders/raw-string-loader.cjs")],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
  env: {
    NEXT_PUBLIC_PLUGIN_VERSION: pluginMeta.version,
    NEXT_PUBLIC_CLI_VERSION: cliMeta.version,
  },
};

export default nextConfig;
