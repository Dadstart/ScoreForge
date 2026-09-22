import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Expo only inlines env vars with static `process.env.EXPO_PUBLIC_*` access
// (not dynamic `process.env[key]`).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function assertConfig() {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey) missing.push('EXPO_PUBLIC_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missing.push('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missing.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missing.push('EXPO_PUBLIC_FIREBASE_APP_ID');
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase env: ${missing.join(', ')}. Ensure mobile/.env exists, then rebuild (npm run export:web / npm start).`,
    );
  }
}

assertConfig();

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

let authReady: Promise<void> | null = null;

/** Ensure an anonymous Firebase session (no UI). Safe to call often. */
export function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) return Promise.resolve();
  if (authReady) return authReady;
  authReady = signInAnonymously(auth)
    .then(() => undefined)
    .catch((err) => {
      authReady = null;
      throw err;
    });
  return authReady;
}
