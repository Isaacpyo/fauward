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
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;
    const rewrites = [
      {
        source: "/ship/:path*",
        destination: `${widgetProductionUrl}/ship/:path*`,
      },
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
