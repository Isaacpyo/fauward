import { Link } from "react-router-dom";

import { agentPath } from "@/lib/agentPaths";

export function WelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-color)] bg-white p-6 shadow-sm md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fauward PWA</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">Agent workspace</h1>
            <p className="mt-2 text-sm text-gray-600">
              Scan shipment labels, verify task details, and advance status with location and notes.
            </p>
            <div className="mt-5">
              <Link
                to={agentPath("login")}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--tenant-primary)] px-4 py-2 text-sm font-semibold text-white"
              >
                Continue to login
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick steps</p>
            <ol className="mt-3 list-decimal space-y-2 pl-4">
              <li>Sign in with your tenant account.</li>
              <li>Scan or enter a tracking reference.</li>
              <li>Capture location + notes, then confirm next status.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}