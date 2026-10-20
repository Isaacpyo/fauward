import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import { setImpersonationToken } from "@/lib/auth";

type ExchangeResponse = {
  token: string;
  expiresAt: string;
  scopes: string[];
  tenant: { id: string; slug: string; name: string };
};

/** Reads the one-time code from the URL fragment (never sent to servers), exchanges it once, keeps the token in sessionStorage. */
export function readImpersonationCode(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("code");
}

export function ImpersonateCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = readImpersonationCode(window.location.hash);
    // Drop the fragment straight away so the code is not left in history.
    window.history.replaceState(null, "", window.location.pathname);
    if (!code) {
      setError("This staff access link is missing its code. Start the session again from the Fauward console.");
      return;
    }
    api
      .post<ExchangeResponse>("/v1/auth/impersonation/exchange", { code })
      .then(({ data }) => {
        setImpersonationToken(data.token, data.tenant.slug);
        navigate("/", { replace: true });
      })
      .catch(() => {
        setError("This staff access link has expired or was already used. Start a new session from the Fauward console.");
      });
  }, [navigate]);

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
          <p>Opening staff session...</p>
        )}
      </div>
    </div>
  );
}
