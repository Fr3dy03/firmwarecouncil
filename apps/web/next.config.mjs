import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const API_URL = process.env.FC_API_URL ?? "http://127.0.0.1:4100";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  transpilePackages: ["@fc/shared"],
  // Pin workspace root explicitly — a stray lockfile in a parent directory
  // makes Next infer the wrong root and warn on every compile.
  outputFileTracingRoot: HERE,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
