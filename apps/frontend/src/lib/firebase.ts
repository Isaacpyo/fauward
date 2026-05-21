"use client";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  browserLocalPersistence,
  type Auth,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";

function requireFirebasePublicEnv(name: string, value: string | undefined) {
  if (value) return value;
  throw new Error(`Missing required Firebase public env var: ${name}`);
}

function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: requireFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: requireFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: requireFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: requireFirebasePublicEnv(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    ),
    messagingSenderId: requireFirebasePublicEnv(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    ),
    appId: requireFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(getFirebaseConfig());
}

function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export async function initFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  return (await isSupported()) ? getAnalytics(getFirebaseApp()) : null;
}

export async function signInWithGoogle() {
  const firebaseAuth = getFirebaseAuth();
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(firebaseAuth, provider);
}

export function getFirebaseAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Google sign-in failed";
  if (message.includes("auth/configuration-not-found")) {
    return "Google sign-in is not enabled for this Firebase project. Enable Firebase Authentication and the Google provider in the Firebase console.";
  }
  return message;
}
