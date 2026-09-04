import { useEffect, useState } from 'react';

import { onAuthChange } from './localAuth';

/*
 * The signed-in admin, or null when signed out.
 *
 * Starts as undefined for "not known yet", so a consumer can tell an
 * unresolved session apart from a genuinely signed-out one.
 */
export function useAuthUser() {
  const [user, setUser] = useState(undefined);

  useEffect(() => onAuthChange((next) => setUser(next ?? null)), []);

  return user;
}
