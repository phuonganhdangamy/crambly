import path from "path";
import { fileURLToPath } from "url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load repo-root `.env` so `NEXT_PUBLIC_*` works when developing from /web (monorepo).
const monorepoRoot = path.join(__dirname, "..");
loadEnvConfig(monorepoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Monorepo: trace serverless output from repo root (Vercel / npm workspaces).
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
};

export default nextConfig;
