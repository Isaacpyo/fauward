import { Fingerprint } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { useDriverStore } from "@/stores/useDriverStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenant = useDriverStore((state) => state.tenant);
  const setAuthenticated = useDriverStore((state) => state.setAuthenticated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const biometricAvailable = useMemo(() => typeof window !== "undefined" && "PublicKeyCredential" in window, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/v1/auth/login", { email, password });
      setTokens(data.accessToken, data.refreshToken);
      setAuthenticated(true, email);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/route";
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error ?? "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-bg)]">
      <header className="bg-[var(--tenant-primary)] px-6 py-8 text-white">
        {tenant.logoUrl ? (
          <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="h-10 w-auto object-contain" />
        ) : null}
        <h1 className="mt-4 text-2xl font-bold">Driver Sign In</h1>
      </header>

      <form onSubmit={handleSubmit} className="mx-auto mt-6 max-w-md space-y-4 px-4">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" autoComplete="email" required />
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" autoComplete="current-password" required />
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>
        <a href="#forgot" className="block text-center text-sm text-gray-600 underline">
          Forgot password
        </a>
        {biometricAvailable ? (
          <Button type="button" variant="secondary" leftIcon={<Fingerprint size={18} />} className="w-full">
            Use biometric login
          </Button>
        ) : null}
      </form>
    </div>
  );
}
