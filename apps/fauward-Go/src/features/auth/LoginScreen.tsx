import { useState, useTransition } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "@/components/common/BrandLogo";
import { useAuthStore } from "@/store/useAuthStore";

export const LoginScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const signIn = useAuthStore((state) => state.signIn);
  const requestEmailSignInLink = useAuthStore((state) => state.requestEmailSignInLink);
  const signInWithEmailLink = useAuthStore((state) => state.signInWithEmailLink);
  const emailLinkTarget = useAuthStore((state) => state.emailLinkTarget);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const emailLinkToken = searchParams.get("token") ?? searchParams.get("code") ?? undefined;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await signIn(email, password);

    if (!result.ok) {
      setError(result.message ?? "Unable to sign in.");
      setNotice(null);
      return;
    }

    setError(null);

    startTransition(() => {
      navigate("/", { replace: true });
    });
  };

  const handleEmailLinkRequest = async () => {
    const result = await requestEmailSignInLink(email);

    if (!result.ok) {
      setError(result.message ?? "Unable to send the sign-in link.");
      setNotice(null);
      return;
    }

    setError(null);
    setNotice(`A sign-in link has been sent to ${email.trim().toLowerCase()}.`);
  };

  const handleEmailLinkSignIn = async () => {
    const result = await signInWithEmailLink(emailLinkToken);

    if (!result.ok) {
      setError(result.message ?? "Unable to sign in with the emailed link.");
      setNotice(null);
      return;
    }

    setError(null);

    startTransition(() => {
      navigate("/", { replace: true });
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <section className="panel-accent overflow-hidden p-6">
        <p className="eyebrow">Secured field access</p>
        <div className="mt-2">
          <BrandLogo />
        </div>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Sign in to access your assigned jobs and field tools, including verification,
          confirmation capture, location updates, and sync controls.
        </p>
      </section>

      <form className="panel mt-5 space-y-4 p-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="mb-2 block tiny-label">
            Operator email
          </label>
          <input
            id="email"
            className="field-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block tiny-label">
            Access code
          </label>
          <input
            id="password"
            className="field-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>

        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button type="submit" className="primary-btn w-full" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign in"}
        </button>

        <button type="button" className="secondary-btn w-full" onClick={() => void handleEmailLinkRequest()} disabled={isPending}>
          Email me a sign-in link
        </button>
      </form>

      {emailLinkTarget ? (
        <section className="panel mt-5 space-y-3 p-5">
          <p className="tiny-label">Email link sign-in</p>
          <p className="text-sm leading-6 text-stone-600">
            A sign-in link is waiting for <span className="font-medium text-ink">{emailLinkTarget}</span>.
          </p>
          {emailLinkToken ? (
            <p className="text-sm leading-6 text-emerald-700">Email-link token detected. The backend consume endpoint will use it.</p>
          ) : null}
          <button type="button" className="primary-btn w-full" onClick={() => void handleEmailLinkSignIn()} disabled={isPending}>
            Open emailed sign-in link
          </button>
        </section>
      ) : null}

      <p className="mt-4 text-center text-xs text-stone-500">
        Need help accessing your account?{" "}
        <a href="mailto:support@fauward.com" className="font-medium text-brand">
          Contact support
        </a>
      </p>
    </main>
  );
};
