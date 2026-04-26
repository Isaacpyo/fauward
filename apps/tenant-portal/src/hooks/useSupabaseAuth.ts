/**
 * Supabase Auth hook for tenant-portal.
 * Provides sign-in, sign-up, sign-out, and session state.
 *
 * The existing useAuth hook (which reads from the Fauward backend JWT) continues
 * to work in parallel — this hook provides the Supabase session that underpins it.
 */
import { useEffect, useState } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
};

export function useSupabaseSession(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, isLoading };
}

type SignInResult = { error: AuthError | null };

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: { full_name?: string },
): Promise<SignInResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  return { error };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<SignInResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  return { error };
}
