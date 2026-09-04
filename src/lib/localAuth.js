/*
 * Admin sign-in, checked in the browser against the ADMIN_USERNAME and
 * ADMIN_PASSWORD from .env.local (mapped in by vite.config.js).
 *
 * This is NOT security. Those values end up in the browser bundle and the
 * session is just a localStorage flag, so anyone can read the credentials
 * and sign themselves in. It exists so the admin screens can be used while
 * everything runs locally.
 *
 * Under Next.js the same credentials were compared on the server and never
 * reached the browser. Restoring that means putting the check back behind
 * something the browser cannot see - a real identity provider, or an
 * endpoint that verifies the password off-device.
 */

const SESSION_KEY = 'local-auth:session';
const CHANGE_EVENT = 'local-auth:changed';

const ADMIN_USERNAME = import.meta.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = import.meta.env.ADMIN_PASSWORD;

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
 * Signs in against the configured admin credentials.
 * Throws when they don't match, or when none are configured.
 */
export async function signIn(username, password) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error(
      'Admin sign-in is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.local, then restart the dev server.'
    );
  }

  // compare both before deciding, so a wrong username and a wrong password
  // are reported the same way and neither can be probed on its own
  const usernameMatches = username.trim() === ADMIN_USERNAME;
  const passwordMatches = password === ADMIN_PASSWORD;

  if (!usernameMatches || !passwordMatches) {
    throw new Error('Incorrect username or password.');
  }

  const user = { username: ADMIN_USERNAME, displayName: 'Admin' };

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
