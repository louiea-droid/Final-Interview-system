/*
 * Local stand-in for admin authentication, for development and testing.
 *
 * This is NOT security. The credentials below sit in the browser bundle and
 * the session is just a localStorage flag, so anyone can sign themselves in.
 * It exists so the admin screens can be worked on without a backend; a real
 * deployment needs an identity provider that verifies credentials off-device.
 */

const SESSION_KEY = 'local-auth:session';
const CHANGE_EVENT = 'local-auth:changed';

const ADMIN_EMAIL = import.meta.env.VITE_LOCAL_ADMIN_EMAIL || 'admin@local';
const ADMIN_PASSWORD = import.meta.env.VITE_LOCAL_ADMIN_PASSWORD || 'admin';

function readSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** The signed-in admin, or null when signed out. */
export function currentUser() {
  return readSession();
}

/**
 * Signs in against the local development credentials.
 * Throws when they don't match, mirroring how a real client would behave.
 */
export async function signIn(email, password) {
  const emailMatches = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (!emailMatches || password !== ADMIN_PASSWORD) {
    throw new Error('Incorrect username or password.');
  }

  const user = { email: ADMIN_EMAIL, displayName: 'Admin' };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(CHANGE_EVENT));

  return user;
}

export async function signOut() {
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Calls `listener` with the current admin now and on every change, including
 * sign-in and sign-out in another tab. Returns an unsubscribe function.
 */
export function onAuthChange(listener) {
  const emit = () => listener(readSession());

  const onStorage = (event) => {
    if (!event.key || event.key === SESSION_KEY) emit();
  };

  emit();
  window.addEventListener(CHANGE_EVENT, emit);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, emit);
    window.removeEventListener('storage', onStorage);
  };
}
