import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "@/lib/api";
import { setImpersonationToken } from "@/lib/auth";

// gtm.demos (WP-4.15): a Fauward demo share link (`/demo/<token>`). The token is exchanged for a read-only session as
// the demo's admin, kept in sessionStorage like a staff session, and dropped from the address bar straight away.

type DemoExchangeResponse = {
  token: string;
  expiresAt: string;
  demoExpiresAt: string;
  tenant: { id: string; slug: string; name: string };
  readOnly: boolean;
};

export function DemoLinkPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, "", "/demo");
    if (!token) {
      setError("This demo link is incomplete. Ask your Fauward contact for a new one.");
      return;
    }
    api
      .post<DemoExchangeResponse>("/v1/auth/demo/exchange", { token })
      .then(({ data }) => {
        setImpersonationToken(data.token, data.tenant.slug);
        navigate("/", { replace: true });
      })
      .catch(() => {
        setError("This demo link has expired or was replaced. Ask your Fauward contact for a new one.");
      });
  }, [navigate, token]);

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-700">
        {error ? (
          <div role="alert" className="space-y-3">
            <p>{error}</p>
            <Link to="/login" className="font-semibold text-gray-900 underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <p>Opening the demo...</p>
        )}
      </div>
    </div>
  );
}
