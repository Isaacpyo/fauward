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
  const [isPending, startTransition] = useTransition();
  // The emailed link is `/login?token=…&email=…`, so it works on any device or browser (C61).
  const emailLinkToken = searchParams.get("token") ?? searchParams.get("code") ?? undefined;
  const emailLinkEmail = searchParams.get("email")?.trim().toLowerCase() || emailLinkTarget;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await signIn(email, password);

    if (!result.ok) {
      setError(result.message ?? "Unable to sign in.");
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
      return;
    }

    setError(null);
  };

  const handleEmailLinkSignIn = async () => {
    const result = await signInWithEmailLink(emailLinkToken, emailLinkEmail);

    if (!result.ok) {
      setError(result.message ?? "Unable to sign in with the emailed link.");
      return;
    }

    setError(null);

    startTransition(() => {
      navigate("/", { replace: true });
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <form className="panel-accent space-y-5 overflow-hidden p-6" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Secured field access</p>
          <div className="mt-2">
            <BrandLogo />
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Sign in to access your assigned jobs and field tools.
          </p>
        </div>

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

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button type="submit" className="primary-btn w-full" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign in"}
        </button>

        <button type="button" className="secondary-btn w-full" onClick={() => void handleEmailLinkRequest()} disabled={isPending}>
          Email me a sign-in link
        </button>
      </form>

      {emailLinkToken ? (
        <section className="panel mt-5 space-y-3 p-5">
          <p className="tiny-label">Email link sign-in</p>
          {emailLinkEmail ? (
            <p className="text-sm leading-6 text-stone-600">
              Sign in as <span className="font-medium text-ink">{emailLinkEmail}</span>.
            </p>
          ) : null}
          <button type="button" className="primary-btn w-full" onClick={() => void handleEmailLinkSignIn()} disabled={isPending}>
            Sign in with emailed link
          </button>
        </section>
      ) : emailLinkTarget ? (
        <section className="panel mt-5 space-y-3 p-5">
          <p className="tiny-label">Check your email</p>
          <p className="text-sm leading-6 text-stone-600">
            We've emailed a sign-in link to <span className="font-medium text-ink">{emailLinkTarget}</span>.
          </p>
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
