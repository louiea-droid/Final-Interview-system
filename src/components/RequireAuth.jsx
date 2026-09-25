import { Navigate, useLocation } from 'react-router-dom';

import { useAuthUser } from '../lib/useAuthUser';

/*
 * Keeps the admin area behind a sign-in. While the session is still being
 * resolved `user` is undefined, and rendering nothing for that moment avoids
 * bouncing an already signed-in admin to the login page on every refresh.
 *
 * The real access check is in firestore.rules / storage.rules.
 */
export default function RequireAuth({ children }) {
  const user = useAuthUser();
  const location = useLocation();

  if (user === undefined) return null;

  if (user === null) {
    return (
      <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
    );
  }

  return children;
}
