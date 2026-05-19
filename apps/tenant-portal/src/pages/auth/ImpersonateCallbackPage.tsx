import { useEffect, useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { decodeAccessToken, setImpersonationToken } from "@/lib/auth";

type ImpersonationClaims = {
  tenantSlug?: string;
  mode?: string;
};

export function ImpersonateCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const claims = useMemo(() => decodeAccessToken<ImpersonationClaims>(token), [token]);

  useEffect(() => {
    if (!token || claims?.mode !== "IMPERSONATION" || !claims.tenantSlug) return;
    setImpersonationToken(token, claims.tenantSlug);
    navigate("/", { replace: true });
  }, [claims, navigate, token]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-700">
        Opening tenant portal session...
      </div>
    </div>
  );
}
