import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAgentAuth } from "@/context/AgentAuthContext";
import { agentPath } from "@/lib/agentPaths";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, isRoleAllowed, authReady } = useAgentAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = useMemo(() => {
    const fromQuery = searchParams.get("next");
    if (fromQuery && fromQuery.startsWith("/")) return fromQuery;
    return agentPath("dashboard");
  }, [searchParams]);

  useEffect(() => {
    if (!authReady) return;
    if (isAuthenticated && isRoleAllowed) {
      navigate(nextPath, { replace: true });
    }
  }, [authReady, isAuthenticated, isRoleAllowed, navigate, nextPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate(nextPath, { replace: true, state: { from: location } });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Agent login</h1>
        <p className="mt-2 text-sm text-gray-600">Use your Fauward tenant credentials.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 text-sm">
          <Link to={agentPath()} className="text-[var(--tenant-primary)] hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}