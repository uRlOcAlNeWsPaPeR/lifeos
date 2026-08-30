/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the Next.js dev-mode indicator (the circled "N" button).
  devIndicators: false,
  serverExternalPackages: ["firebase-admin"],
  experimental: {
    // Keep the client router cache warm so returning to a section is instant.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
