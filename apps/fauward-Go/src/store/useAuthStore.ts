import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { fieldApi } from "@/lib/api/fieldApi";
import { ApiError, clearStoredTenantSlug, setStoredTenantSlug } from "@/lib/api/http";
import type { FieldUser } from "@/types/field";

type SignInResult = {
  ok: boolean;
  message?: string;
};

type AuthStore = {
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  accessToken?: string;
  tenantSlug?: string;
  user?: FieldUser;
  /** Email a sign-in link was last sent to; the token itself only ever arrives in that email (C61). */
  emailLinkTarget?: string;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  requestEmailSignInLink: (email: string) => Promise<SignInResult>;
  /** `email` comes from the link (`?email=`) so it works on another device; falls back to `emailLinkTarget`. */
  signInWithEmailLink: (token: string | undefined, email?: string) => Promise<SignInResult>;
  restoreSession: () => Promise<void>;
  signOut: () => void;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const clearAuthState = () => ({
  isAuthenticated: false,
  accessToken: undefined,
  tenantSlug: undefined,
  user: undefined,
  emailLinkTarget: undefined,
});

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isRestoringSession: false,
      accessToken: undefined,
      tenantSlug: undefined,
      user: undefined,
      emailLinkTarget: undefined,
      signIn: async (email, password) => {
        try {
          const normalizedEmail = email.trim().toLowerCase();
          const session = await fieldApi.login(normalizedEmail, password);
          setStoredTenantSlug(session.tenantSlug);

          set({
            isAuthenticated: true,
            accessToken: session.accessToken,
            tenantSlug: session.tenantSlug,
            user: session.user,
            emailLinkTarget: undefined,
          });

          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: getErrorMessage(error, "Unable to sign in."),
          };
        }
      },
      requestEmailSignInLink: async (email) => {
        try {
          const normalizedEmail = email.trim().toLowerCase();

          if (!normalizedEmail || !normalizedEmail.includes("@")) {
            return {
              ok: false,
              message: "Enter a valid email address to receive a sign-in link.",
            };
          }

          await fieldApi.requestEmailLink(normalizedEmail);
          set({ emailLinkTarget: normalizedEmail });

          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: getErrorMessage(error, "Unable to send the sign-in link."),
          };
        }
      },
      signInWithEmailLink: async (token, email) => {
        try {
          const pendingEmail = (email?.trim() || get().emailLinkTarget)?.toLowerCase();

          if (!token || !pendingEmail) {
            return {
              ok: false,
              message: "Open the sign-in link from your email.",
            };
          }

          const session = await fieldApi.consumeEmailLink(pendingEmail, token);
          setStoredTenantSlug(session.tenantSlug);

          set({
            isAuthenticated: true,
            accessToken: session.accessToken,
            tenantSlug: session.tenantSlug,
            user: session.user,
            emailLinkTarget: undefined,
          });

          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: getErrorMessage(error, "Unable to sign in with the emailed link."),
          };
        }
      },
      restoreSession: async () => {
        const accessToken = get().accessToken;

        if (!accessToken) {
          return;
        }

        set({ isRestoringSession: true });

        try {
          const user = await fieldApi.getMe(accessToken);

          set({
            isAuthenticated: true,
            user,
          });
        } catch {
          clearStoredTenantSlug();
          set(clearAuthState());
        } finally {
          set({ isRestoringSession: false });
        }
      },
      signOut: () => {
        const accessToken = get().accessToken;

        if (accessToken) {
          void fieldApi.logout(accessToken).catch(() => undefined);
        }

        clearStoredTenantSlug();
        set(clearAuthState());
      },
    }),
    {
      name: "fauward-go-auth-v2",
      storage: createJSONStorage(() => localStorage),
      // Version 0 also stored the email-link token the API used to return (C61); drop it on load.
      version: 1,
      migrate: (persisted) => {
        const state = { ...(persisted as Record<string, unknown>) };
        delete state.emailLinkToken;
        return state as Partial<AuthStore>;
      },
    },
  ),
);
