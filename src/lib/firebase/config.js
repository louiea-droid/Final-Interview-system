/*
 * Firebase app connection - the one place the project's config and the
 * initialized app instance live. Every other file here (auth.js,
 * firestore.js, storage.js) builds on this instead of calling
 * initializeApp() a second time.
 *
 * These values are Firebase's public web config, not secrets - Firebase
 * expects them to ship in the bundle and protects data instead through the
 * rules in firestore.rules / storage.rules. They're still read from env
 * vars rather than hardcoded so each environment (local, staging, prod)
 * can point at its own Firebase project without a code change.
 */

import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Vite's dev server hot-reloads this module; guard against re-initializing
// the same app on every edit.
export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
