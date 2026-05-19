import { Link } from "react-router-dom";

// In production, set VITE_STATUS_DASHBOARD_URL to the Railway-deployed status dashboard URL.
// In local dev, /status/ is proxied by Vite to localhost:4000.
const DASHBOARD_URL = import.meta.env.VITE_STATUS_DASHBOARD_URL ?? "/status/";

export function StatusPage() {
  const isProd = import.meta.env.PROD && !import.meta.env.VITE_STATUS_DASHBOARD_URL;

  if (isProd) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0d0f18]">
        <div className="absolute right-4 top-2.5">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/10 hover:text-white">
            ← Admin
          </Link>
        </div>
        <p className="font-mono text-sm text-white/40">Status dashboard not configured for production.</p>
        <p className="font-mono text-xs text-white/25">Set VITE_STATUS_DASHBOARD_URL in Vercel environment variables.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0f18]">
      <div className="absolute right-4 top-2.5 z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          ← Admin
        </Link>
      </div>
      <iframe
        src={DASHBOARD_URL}
        className="h-full w-full border-0"
        title="Status Dashboard"
      />
    </div>
  );
}
