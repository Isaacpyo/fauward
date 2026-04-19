import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { useSyncStore } from "@/store/useSyncStore";
import type { FieldUser } from "@/types/field";

type SignInResult = {
  ok: boolean;
  message?: string;
};

type AuthStore = {
  isAuthenticated: boolean;
  user?: FieldUser;
  emailLinkTarget?: string;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  requestEmailSignInLink: (email: string) => Promise<SignInResult>;
  signInWithEmailLink: () => Promise<SignInResult>;
  signOut: () => void;
};

const demoCredentials = {
  email: "ops@fauward.test",
  password: "246810",
};

const baseUser: Omit<FieldUser, "email"> = {
  id: "field-user-1",
  name: "Ife Johnson",
  role: "Field operator",
  tenantLabel: "Fauward Lagos",
  vehicleLabel: "FG-2142",
  shiftLabel: "Morning loop",
};

const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const buildUser = (email: string): FieldUser => ({
  ...baseUser,
  email,
});

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: undefined,
      emailLinkTarget: undefined,
      signIn: async (email, password) => {
        await pause(350);

        const normalizedEmail = email.trim().toLowerCase();

        if (normalizedEmail !== demoCredentials.email || password !== demoCredentials.password) {
          return {
            ok: false,
            message: "The email or password is incorrect.",
          };
        }

        useFieldDataStore.getState().seedDemoData();

        set({
          isAuthenticated: true,
          user: buildUser(normalizedEmail),
          emailLinkTarget: undefined,
        });

        return { ok: true };
      },
      requestEmailSignInLink: async (email) => {
        await pause(350);

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail || !normalizedEmail.includes("@")) {
          return {
            ok: false,
            message: "Enter a valid email address to receive a sign-in link.",
          };
        }

        set({
          emailLinkTarget: normalizedEmail,
        });

        return { ok: true };
      },
      signInWithEmailLink: async () => {
        await pause(350);

        const pendingEmail = get().emailLinkTarget;

        if (!pendingEmail) {
          return {
            ok: false,
            message: "Request a sign-in link first.",
          };
        }

        useFieldDataStore.getState().seedDemoData();

        set({
          isAuthenticated: true,
          user: buildUser(pendingEmail),
          emailLinkTarget: undefined,
        });

        return { ok: true };
      },
      signOut: () => {
        useFieldDataStore.getState().resetFieldData();
        useSyncStore.getState().reset();

        set({
          isAuthenticated: false,
          user: undefined,
          emailLinkTarget: undefined,
        });
      },
    }),
    {
      name: "fauward-go-auth-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
