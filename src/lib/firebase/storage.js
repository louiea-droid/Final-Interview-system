/*
 * Firebase Storage connection. Not wired into the app yet - candidate
 * photos still get downscaled to data URLs and kept in localStorage by
 * src/lib/localBackend.js - this just exposes a ready `storage` instance
 * for whenever that swap happens.
 *
 * storage.rules currently denies all read/write - it'll need real rules
 * before this is used for anything.
 */

import { getStorage } from 'firebase/storage';
import { firebaseApp } from './config';

export const storage = getStorage(firebaseApp);
