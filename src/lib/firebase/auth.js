/*
 * Firebase Authentication connection. Not wired into the app yet - sign-in
 * still runs through src/lib/localAuth.js - this just exposes a ready
 * `auth` instance for whenever that swap happens.
 */

import { getAuth } from 'firebase/auth';
import { firebaseApp } from './config';

export const auth = getAuth(firebaseApp);
