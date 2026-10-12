import type { NextConfig } from "next";

/** "DEV" only when the .env says APP_ENV=development (or dev); production otherwise. */
const APP_MODE = /^(dev|development)$/i.test(process.env.APP_ENV?.trim() ?? "") ? "DEV" : "PROD";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_MODE: APP_MODE },
  outputFileTracingExcludes: {
    "/api/taipei/photos": ["./public/taipei/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/images-for-twilio/**",
      },
    ],
  },
};

export default nextConfig;
