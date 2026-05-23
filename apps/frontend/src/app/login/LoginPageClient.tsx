"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Eye, EyeOff, Sparkles } from "lucide-react";

import BrandLogo from "@/components/marketing/BrandLogo";
import { VALUE_PROP_BULLETS } from "@/lib/marketing-data";
import { getFirebaseAuthErrorMessage, signInWithGoogle } from "@/lib/firebase";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
};

function getLoginErrorMessage(message: string) {
  if (message === "Tenant context required") {
    return "We could not find a tenant workspace for this email.";
  }
  if (message === "Internal Server Error" || message === "Login failed") {
    return "Invalid email or password.";
  }
  return message;
}

export default function LoginPageClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<{ title: string; message: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setAuthModal(null);

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
      setAuthModal({
        title: "Sign-in failed",
        message: getLoginErrorMessage(message)
      });
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setLoading(true);
    setError(null);
    setAuthModal(null);

    try {
      const result = await signInWithGoogle();
      const idToken = await result.user.getIdToken();
      const response = await fetch("/api/v1/auth/firebase-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { accessToken?: string; refreshToken?: string; tenantSlug?: string; error?: string }
        | null;

      if (!response.ok || !payload?.accessToken || !payload.refreshToken || !payload.tenantSlug) {
        throw new Error(payload?.error || "Google sign-in failed");
      }

      if (payload.tenantSlug === "system") {
        setAuthModal({
          title: "Email not recognized",
          message: "We could not find a tenant workspace for this email."
        });
        return;
      }
      localStorage.setItem("fauward_access_token", payload.accessToken);
      localStorage.setItem("fauward_refresh_token", payload.refreshToken);
      window.location.assign(`https://${payload.tenantSlug}.fauward.com/dashboard`);
    } catch (googleError) {
      setAuthModal({
        title: "Email not recognized",
        message: getFirebaseAuthErrorMessage(googleError).includes("Google account is not allowed")
          ? "We could not find a tenant workspace for this email."
          : getFirebaseAuthErrorMessage(googleError)
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-slate-50 py-12 lg:py-16">
      {/* Light grid + animated glow orbs (consistent with marketing pages) */}
      <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/4 -z-10 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-1/4 -z-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl"
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {authModal ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-gray-900">{authModal.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">{authModal.message}</p>
            <button
              type="button"
              onClick={() => setAuthModal(null)}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-gray-900 transition hover:bg-amber-400"
            >
              Use admin credential
            </button>
          </motion.div>
        </motion.div>
      ) : null}

      <div className="marketing-container">
        <motion.div
          className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {/* Pitch panel */}
          <motion.aside
            variants={item}
            className="relative hidden overflow-hidden rounded-3xl border border-gray-200 bg-white p-10 shadow-sm lg:block"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-px -z-10 rounded-3xl"
              style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, transparent 50%, rgba(59,130,246,0.18) 100%)" }}
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <span aria-hidden className="absolute inset-0 -z-[5] rounded-3xl bg-white" />

            <motion.div variants={item} className="mb-6 w-[170px]">
              <BrandLogo variant="lockup" />
            </motion.div>

            <motion.div variants={item} className="mb-4 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles size={12} className="text-amber-500" />
                <span className="relative z-10">Welcome back</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{ background: "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%, transparent 100%)" }}
                />
              </span>
            </motion.div>

            <motion.h2 variants={item} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              Your logistics{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  command centre
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.6, ease: EASE }}
                />
              </span>
            </motion.h2>
            <motion.p variants={item} className="mt-4 text-base leading-relaxed text-gray-600">
              Sign in to your tenant workspace — shipments, drivers, customer tracking, and finance all in one place.
            </motion.p>

            <motion.ul variants={item} className="mt-6 space-y-3">
              {VALUE_PROP_BULLETS.slice(0, 5).map((b, i) => (
                <motion.li
                  key={b}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.5, ease: EASE }}
                  className="flex items-start gap-2.5 text-sm text-gray-700"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {b}
                </motion.li>
              ))}
            </motion.ul>
          </motion.aside>

          {/* Login card */}
          <motion.div
            variants={item}
            className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-xl lg:p-10"
          >
            <motion.h1
              variants={item}
              className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl"
            >
              Sign in
            </motion.h1>
            <motion.p variants={item} className="mt-2 text-sm text-gray-600">
              Access your tenant dashboard.
            </motion.p>

            <motion.form
              variants={item}
              className="mt-6 space-y-4"
              onSubmit={onSubmit}
            >
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
                  className="h-12 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 w-full rounded-lg border border-gray-200 bg-white px-4 pr-11 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </motion.p>
              ) : null}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-6 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  {loading ? "Signing in..." : "Sign in"}
                  {!loading && (
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  )}
                </span>
                {!loading && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 -z-0"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.7, ease: EASE }}
                    style={{
                      background:
                        "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
                    }}
                  />
                )}
              </motion.button>
            </motion.form>

            <motion.div variants={item} className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </motion.div>

            <motion.button
              variants={item}
              type="button"
              onClick={onGoogleSignIn}
              disabled={loading}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              Continue with Google
            </motion.button>

            <motion.div variants={item} className="mt-5 flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="font-semibold text-amber-700 underline-offset-4 hover:underline">
                Forgot password?
              </Link>
              <span className="text-gray-500">
                New to Fauward?{" "}
                <MotionLink
                  href="/signup"
                  whileHover={{ x: 2 }}
                  className="inline-flex items-center gap-1 font-semibold text-amber-700 underline-offset-4 hover:underline"
                >
                  Start free trial <ArrowRight size={12} />
                </MotionLink>
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
