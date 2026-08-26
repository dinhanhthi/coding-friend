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
  },
  async redirects() {
    return [
      { source: "/docs/:path*", destination: "/", permanent: true },
      { source: "/docs", destination: "/", permanent: true },
      {
        source: "/changelog",
        destination: "https://github.com/dinhanhthi/coding-friend/releases",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
