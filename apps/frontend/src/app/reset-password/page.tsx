"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const tokenFromQuery = useMemo(() => params.get('token') ?? '', [params]);
  const [token, setToken] = useState(tokenFromQuery);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Unable to reset password');
      }

      setMessage('Password reset successful. You can now sign in.');
      setNewPassword('');
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : 'Unable to reset password';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 lg:p-8">
          <h1 className="text-3xl font-bold text-gray-900">Reset password</h1>
          <p className="mt-2 text-sm text-gray-600">Enter your reset token and choose a new password.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="token">
                Reset token
              </label>
              <input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
                minLength={8}
                required
              />
            </div>

            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>

          <div className="mt-4 text-sm">
            <Link href="/login" className="text-amber-700 hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
