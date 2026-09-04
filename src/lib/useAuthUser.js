import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from './firebase';

/*
 * The signed-in Firebase user, or null when signed out.
 *
 * Starts as undefined to mean "not known yet": Firebase restores a persisted
 * session asynchronously, so treating that first moment as signed out would
 * sign the admin out on every page load.
 */
export function useAuthUser() {
  const [user, setUser] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next ?? null)), []);

  return user;
}
