/** @type {import('next').NextConfig} */
const nextConfig = {
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
    if (!backendUrl) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl.replace(/\/$/, "")}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
