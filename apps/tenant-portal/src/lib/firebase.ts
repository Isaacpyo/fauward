import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  type Auth,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup
} from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredFirebaseKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;

function hasFirebaseAuthConfig(config: FirebaseOptions) {
  return requiredFirebaseKeys.every((key) => {
    const value = config[key];
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length > 0 && !trimmed.startsWith("your-");
  });
}

const app = hasFirebaseAuthConfig(firebaseConfig)
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth: Auth | null = app ? getAuth(app) : null;

export function isGoogleSignInConfigured() {
  return Boolean(firebaseAuth);
}

export async function signInWithGoogle() {
  if (!firebaseAuth) {
    throw new Error("auth/configuration-not-found");
  }

  await setPersistence(firebaseAuth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(firebaseAuth, provider);
}

export function getFirebaseAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Google sign-in failed";
  if (message.includes("auth/configuration-not-found")) {
    return "Google sign-in is not enabled yet. Use email and password for now.";
  }
  return message;
}
