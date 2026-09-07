/*
 * Firestore connection. Not wired into the app yet - candidate and
 * announcement data still lives in src/lib/localBackend.js - this just
 * exposes a ready `db` instance for whenever that swap happens.
 */

import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './config';

export const db = getFirestore(firebaseApp);
