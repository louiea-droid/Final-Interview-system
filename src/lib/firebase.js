import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/*
 * All of these are safe to ship in the browser bundle - Firebase identifies
 * the project with them but does not authorise anything. Who may read or
 * write data is decided by Firestore and Storage security rules, and by
 * Firebase Auth sign-in, not by keeping these values secret.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/*
 * Without configuration Firebase throws from deep inside the SDK on first
 * use, which surfaces as a blank page. Failing loudly here instead names
 * the actual problem.
 */
const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    'Firebase is not configured. Missing ' +
      missing.join(', ') +
      '. Copy .env.local.example to .env.local and fill in the values from ' +
      'the Firebase console (Project settings -> General -> Your apps).'
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/* Collection holding one document per interview candidate. */
export const CANDIDATES = 'candidates';
