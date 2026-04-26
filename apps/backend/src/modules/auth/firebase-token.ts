import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

type FirebaseCerts = Record<string, string>;

type FirebaseTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

let cachedCerts: { expiresAt: number; certs: FirebaseCerts } | null = null;

async function fetchFirebaseCerts(): Promise<FirebaseCerts> {
  if (cachedCerts && cachedCerts.expiresAt > Date.now()) {
    return cachedCerts.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new Error('Unable to fetch Firebase public certificates');
  }

  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await response.json()) as FirebaseCerts;

  cachedCerts = {
    certs,
    expiresAt: Date.now() + Math.max(maxAgeSeconds - 60, 60) * 1000
  };

  return certs;
}

export async function verifyFirebaseIdToken(idToken: string) {
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded?.header.kid;
  if (!kid) {
    throw new Error('Invalid Firebase token header');
  }

  const certs = await fetchFirebaseCerts();
  const cert = certs[kid];
  if (!cert) {
    cachedCerts = null;
    throw new Error('Unknown Firebase token key');
  }

  const projectId = config.firebase.projectId;
  const payload = jwt.verify(idToken, cert, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  }) as FirebaseTokenPayload;

  if (!payload.sub) {
    throw new Error('Firebase token is missing subject');
  }

  return payload;
}
