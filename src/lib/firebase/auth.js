/*
 * Admin sign-in through Firebase Authentication (email/password). The real
 * access check is in firestore.rules and storage.rules, which only let the
 * listed admin UIDs write - RequireAuth just keeps the admin screens tidy.
 */

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { firebaseApp } from './config';

export const auth = getAuth(firebaseApp);

const MESSAGES = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
};

function toAdmin(user) {
  return user ? { email: user.email, uid: user.uid } : null;
}

export function currentUser() {
  return toAdmin(auth.currentUser);
}

export async function signIn(email, password) {
  try {
    return toAdmin((await signInWithEmailAndPassword(auth, email.trim(), password)).user);
  } catch (error) {
    throw new Error(MESSAGES[error.code] ?? 'Sign-in failed. Please try again.');
  }
}

export function signOut() {
  return firebaseSignOut(auth);
}

/** Calls `listener` with the admin (or null) now and on every change. */
export function onAuthChange(listener) {
  return onAuthStateChanged(auth, (user) => listener(toAdmin(user)));
}
