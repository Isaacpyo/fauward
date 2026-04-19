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
  emailLinkTarget?: string;
  emailLinkToken?: string;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  requestEmailSignInLink: (email: string) => Promise<SignInResult>;
  signInWithEmailLink: (token?: string) => Promise<SignInResult>;
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
  emailLinkToken: undefined,
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
      emailLinkToken: undefined,
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
            emailLinkToken: undefined,
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

          const result = await fieldApi.requestEmailLink(normalizedEmail);

          if (result.tenantSlug) {
            setStoredTenantSlug(result.tenantSlug);
          }

          set({
            emailLinkTarget: normalizedEmail,
            emailLinkToken: result.linkToken,
            tenantSlug: result.tenantSlug ?? get().tenantSlug,
          });

          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: getErrorMessage(error, "Unable to send the sign-in link."),
          };
        }
      },
      signInWithEmailLink: async (token) => {
        try {
          const pendingEmail = get().emailLinkTarget;

          if (!pendingEmail) {
            return {
              ok: false,
              message: "Request a sign-in link first.",
            };
          }

          const session = await fieldApi.consumeEmailLink(pendingEmail, token ?? get().emailLinkToken);
          setStoredTenantSlug(session.tenantSlug);

          set({
            isAuthenticated: true,
            accessToken: session.accessToken,
            tenantSlug: session.tenantSlug,
            user: session.user,
            emailLinkTarget: undefined,
            emailLinkToken: undefined,
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
    },
  ),
);
