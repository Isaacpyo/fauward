const serverBuildFallbacks = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000000000",
};

export function getFirebasePublicEnv(name: keyof typeof serverBuildFallbacks) {
  const value = process.env[name];
  if (value) return value;

  if (typeof window === "undefined") {
    return serverBuildFallbacks[name];
  }

  throw new Error(`Missing required Firebase public env var: ${name}`);
}
