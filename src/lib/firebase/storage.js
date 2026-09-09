/*
 * Firebase Storage connection, used by useBoardLayoutEditor.js for every
 * photo and video an admin drops onto the visual board (the logo, board
 * photos, frame fills, carousel photos, background video) - only the
 * resulting download URL ever lands in a Firestore document. Candidate
 * photos are the one holdout: they still get downscaled to data URLs and
 * kept in localStorage by src/lib/localBackend.js, for whenever that swap
 * happens too.
 *
 * storage.rules is wide open the same way firestore.rules is (see there for
 * why) - it'll need real rules once sign-in moves to Firebase Auth.
 */

import { getStorage } from 'firebase/storage';
import { firebaseApp } from './config';

export const storage = getStorage(firebaseApp);
