import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { hasPlatformSessionHint } from "@/lib/auth";
import { consoleApi } from "@/lib/console-api";
import { MfaCodeInput } from "./MfaCodeInput";
import { apiErrorMessage } from "@/lib/console-api-error";
import { ME_QUERY_KEY } from "@/lib/use-me";

type LoginResponse = { mfa: "VERIFY" | "ENROLL" };
type MeResponse = { mfa?: { enabled: boolean; pending: boolean } };
type EnrollStart = { otpauth: string; qrCode: string };

type Step =
  | { kind: "checking" }
  | { kind: "password" }
  | { kind: "verify" }
  | { kind: "enroll"; enrollment: EnrollStart | null };

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--fauward-navy)] focus:ring-1 focus:ring-[var(--fauward-navy)]";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--fauward-navy)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";

/** Only same-origin console paths are allowed as a post-login destination. */
export function safeNextPath(search: string, state: unknown): string {
  const fromQuery = new URLSearchParams(search).get("next");
  const fromState = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const candidate = fromQuery ?? (fromState?.pathname ? `${fromState.pathname}${fromState.search ?? ""}` : null);
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/login")) return "/";
  return candidate;
}

function secretFromOtpauth(otpauth: string) {
  try {
    return new URL(otpauth).searchParams.get("secret");
  } catch {
    return null;
  }
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-50)]">
      <div className="w-full max-w-sm px-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-10 w-10 shrink-0 object-contain" />
            <div>
              <p className="text-sm font-bold text-[var(--fauward-navy)]">Fauward</p>
              <p className="text-xs text-[var(--color-text-muted)]">Super Admin</p>
            </div>
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const next = safeNextPath(location.search, location.state);
  const [step, setStep] = useState<Step>(hasPlatformSessionHint() ? { kind: "checking" } : { kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrollStarted = useRef(false);

  // An existing session skips the password step: fully verified → leave /login; MFA-pending → straight to the MFA step.
  useEffect(() => {
    if (step.kind !== "checking") return;
    let cancelled = false;
    consoleApi
      .get<MeResponse>("/auth/me", { skipAuthRedirect: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.mfa && !data.mfa.pending) navigate(next, { replace: true });
        else setStep(data.mfa?.enabled ? { kind: "verify" } : { kind: "enroll", enrollment: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const pending = (err as { code?: string }).code === "MFA_PENDING";
        if (pending) {
          setStep({ kind: "verify" });
          return;
        }
        setStep({ kind: "password" });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, next, step.kind]);

  useEffect(() => {
    if (step.kind !== "enroll" || step.enrollment || enrollStarted.current) return;
    enrollStarted.current = true;
    consoleApi
      .post<EnrollStart>("/auth/mfa/enroll/start", {}, { skipAuthRedirect: true })
      .then(({ data }) => setStep({ kind: "enroll", enrollment: data }))
      .catch((err: unknown) => {
        enrollStarted.current = false;
        setError(apiErrorMessage(err, "Could not start MFA enrolment."));
      });
  }, [step]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await consoleApi.post<LoginResponse>("/auth/login", { email: email.trim().toLowerCase(), password }, { skipAuthRedirect: true });
      setPassword("");
      setCode("");
      setStep(data.mfa === "VERIFY" ? { kind: "verify" } : { kind: "enroll", enrollment: null });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Invalid credentials"));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const path = step.kind === "enroll" ? "/auth/mfa/enroll/confirm" : "/auth/mfa/verify";
      await consoleApi.post(path, { code }, { skipAuthRedirect: true });
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      navigate(next, { replace: true });
    } catch (err: unknown) {
      setCode("");
      const locked = (err as { code?: string }).code === "MFA_LOCKED";
      setError(apiErrorMessage(err, "That code is not valid."));
      if (locked) setStep({ kind: "password" });
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[var(--color-surface-50)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
        <p className="text-sm text-[var(--color-text-muted)]">Checking session…</p>
      </div>
    );
  }

  if (step.kind === "verify") {
    return (
      <Card title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app.">
        <form className="mt-6 space-y-4" onSubmit={submitCode}>
          <MfaCodeInput id="sa-mfa-code" value={code} onChange={setCode} autoFocus />
          <ErrorText error={error} />
          <button type="submit" disabled={busy || code.length !== 6} className={primaryButtonClass}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>
      </Card>
    );
  }

  if (step.kind === "enroll") {
    const secret = step.enrollment ? secretFromOtpauth(step.enrollment.otpauth) : null;
    return (
      <Card title="Set up two-factor authentication" subtitle="MFA is required for every console account. Scan the code with an authenticator app, then enter the 6-digit code it shows.">
        <form className="mt-6 space-y-4" onSubmit={submitCode}>
          {step.enrollment ? (
            <div className="flex flex-col items-center gap-2">
              <img src={step.enrollment.qrCode} alt="Authenticator QR code" className="h-40 w-40" />
              {secret ? (
                <p className="text-center text-xs text-[var(--color-text-muted)]">
                  Can’t scan? Enter this key: <span className="break-all font-mono text-[var(--color-text-primary)]">{secret}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">{error ? "" : "Preparing your QR code…"}</p>
          )}
          <MfaCodeInput id="sa-mfa-enroll-code" value={code} onChange={setCode} autoFocus />
          <ErrorText error={error} />
          <button type="submit" disabled={busy || !step.enrollment || code.length !== 6} className={primaryButtonClass}>
            {busy ? "Confirming…" : "Confirm and continue"}
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card title="Sign in" subtitle="Internal access only.">
      <form className="mt-6 space-y-4" onSubmit={submitPassword}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="sa-email">
            Email
          </label>
          <input id="sa-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="sa-password">
            Password
          </label>
          <input id="sa-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        <ErrorText error={error} />
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-[var(--color-text-muted)]">
        Need help?{" "}
        <a href="mailto:support@fauward.com" className="font-semibold text-[var(--fauward-navy)] hover:underline">
          Contact support
        </a>
      </p>
    </Card>
  );
}
