/** @type {import('next').NextConfig} */
const windowsProductionDistDir = process.platform === "win32" && process.env.NODE_ENV === "production"
  ? ".next-build"
  : undefined;

const nextConfig = {
  ...(windowsProductionDistDir ? { distDir: windowsProductionDistDir } : {}),
  async headers() {
    return [
      {
        // Allow any origin to embed this widget in an iframe.
        // Tighten this in production to known tenant domains.
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
