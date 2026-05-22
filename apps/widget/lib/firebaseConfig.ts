import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFirebasePublicEnv } from "./firebaseEnv";

const firebaseConfig = {
  apiKey: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getFirebasePublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
