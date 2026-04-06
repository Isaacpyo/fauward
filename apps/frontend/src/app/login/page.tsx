"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const payload = (await response.json().catch(() => null)) as
        | { accessToken?: string; refreshToken?: string; tenantSlug?: string; error?: string }
        | null;

      if (!response.ok || !payload?.accessToken || !payload.refreshToken || !payload.tenantSlug) {
        throw new Error(payload?.error || 'Login failed');
      }

      localStorage.setItem('fauward_access_token', payload.accessToken);
      localStorage.setItem('fauward_refresh_token', payload.refreshToken);
      window.location.assign(`https://${payload.tenantSlug}.fauward.com/dashboard`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 lg:p-8">
          <h1 className="text-3xl font-bold text-gray-900">Sign in</h1>
          <p className="mt-2 text-sm text-gray-600">Access your tenant dashboard.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
                required
              />
            </div>

            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-amber-700 hover:underline">
              Forgot password?
            </Link>
            <Link href="/signup" className="text-amber-700 hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
