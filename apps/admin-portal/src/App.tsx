import { FormEvent, useState } from 'react';
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

type LoginState = 'idle' | 'submitting' | 'failed';

async function submitAdminLogin(email: string, password: string) {
  const response = await fetch('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error('Admin sign-in failed');
  }
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoginState>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');

    try {
      await submitAdminLogin(email, password);
      window.location.assign('/');
    } catch {
      setState('failed');
    }
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
        <section className="grid w-full gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,440px)] lg:items-center">
          <div className="space-y-8">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-emerald-700 text-white shadow-sm">
                <ShieldCheck aria-hidden="true" size={25} strokeWidth={2.2} />
              </div>
              <h1 className="text-4xl font-semibold leading-tight tracking-normal text-zinc-950 sm:text-5xl">
                Fauward Admin
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
                Internal operations access for platform administration.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800">
                <KeyRound className="text-amber-600" aria-hidden="true" size={18} />
                Admin hostname
              </div>
              <div className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800">
                <LockKeyhole className="text-rose-700" aria-hidden="true" size={18} />
                Edge policy
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-zinc-950">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Use an allowlisted super-admin account.</p>
            </div>

            <label className="block text-sm font-medium text-zinc-800" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              required
            />

            <label className="mt-5 block text-sm font-medium text-zinc-800" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              required
            />

            {state === 'failed' ? (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Sign-in failed.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={state === 'submitting'}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {state === 'submitting' ? 'Signing in' : 'Continue'}
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return <LoginPage />;
}
