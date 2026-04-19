// src/lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function createFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const firebaseApp = createFirebaseApp();
export const firebaseAuth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// OAuth Providers
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({
  prompt: "select_account",
  tenant: "common",
});

async function oauthSignIn(provider: GoogleAuthProvider | OAuthProvider): Promise<User> {
  await setPersistence(firebaseAuth, browserLocalPersistence);

  const res = await signInWithPopup(firebaseAuth, provider);

  const idToken = await res.user.getIdToken(true);
  const r = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!r.ok) {
    await signOut(firebaseAuth);
    let msg = "Sign-in not allowed";
    try {
      const data = await r.json();
      msg = data?.error || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.user;
}

export async function googleSignIn(): Promise<User> {
  return oauthSignIn(googleProvider);
}

export async function microsoftSignIn(): Promise<User> {
  return oauthSignIn(microsoftProvider);
}

export async function logout() {
  await fetch("/api/auth/session", { method: "DELETE" });
  await signOut(firebaseAuth);
}

let _secondaryApp: FirebaseApp | null = null;
let _secondaryAuth: Auth | null = null;

export function getSecondaryAuth() {
  if (_secondaryAuth) return _secondaryAuth;
  _secondaryApp = initializeApp(firebaseConfig, "SECONDARY_AUTH");
  _secondaryAuth = getAuth(_secondaryApp);
  return _secondaryAuth;
}
