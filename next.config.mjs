import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCORECLIMB_ORIGIN = (process.env.SCORECLIMB_ORIGIN || "https://singular-klepon-be59b4.netlify.app").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this repo. Without it Next walks up looking for a
  // lockfile and can settle on one in a parent/home directory, which prints a
  // warning on every dev start and traces the wrong files for the build.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Hide the Next.js dev-mode indicator (the circled "N" button).
  devIndicators: false,
  serverExternalPackages: ["firebase-admin"],
  // SAT Prep's question bank is published by ScoreClimb (with its weekly
  // College Board sync). Proxy it server-side so the browser sees it as
  // same-origin — no CORS, and no copy of the 36 MB bank in this repo.
  async rewrites() {
    return [{ source: "/sat-data/:path*", destination: `${SCORECLIMB_ORIGIN}/data/:path*` }];
  },
  experimental: {
    // Keep the client router cache warm so returning to a section is instant.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
