/** @type {import('next').NextConfig} */
const windowsProductionDistDir = process.platform === "win32" && process.env.NODE_ENV === "production"
  ? ".next-build"
  : undefined;
const widgetProductionUrl = "https://fauward-widget.vercel.app";

const nextConfig = {
  ...(windowsProductionDistDir ? { distDir: windowsProductionDistDir } : {}),
  reactStrictMode: true,
  transpilePackages: ["@fauward/relay-api", "@fauward/relay-ui"],
  async redirects() {
    return [
      // /business merged into /services — preserve anchor deep-links
      { source: "/business", destination: "/services", permanent: true },
      { source: "/business/:path*", destination: "/services/:path*", permanent: true },
      // Hosted shipment URL moved to ship.fauward.com — permanently retire /ship on the apex.
      { source: "/ship", destination: "https://ship.fauward.com/", statusCode: 301 },
      { source: "/ship/:path*", destination: "https://ship.fauward.com/:path*", statusCode: 301 },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;
    // /api/embed/token and /api/widget/:path* stay rewritten to the widget origin:
    //   - /api/embed/token serves dormant embed-SDK token minting (kept, unadvertised).
    //   - /api/widget/:path* is live — the hosted form posts to it (shipments, phone OTP, etc.).
    // The /ship/:path* rewrite is intentionally gone; it's now a 301 in redirects() above.
    const rewrites = [
      {
        source: "/api/embed/token",
        destination: `${widgetProductionUrl}/api/embed/token`,
      },
      {
        source: "/api/widget/:path*",
        destination: `${widgetProductionUrl}/api/widget/:path*`,
      },
    ];

    if (!backendUrl) return rewrites;
    return [
      ...rewrites,
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl.replace(/\/$/, "")}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
