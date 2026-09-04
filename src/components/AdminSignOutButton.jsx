import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LogOut } from 'lucide-react';

import { auth } from '../lib/firebase';

export default function AdminSignOutButton() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut(auth);
    navigate('/admin/login', { replace: true });
  }

  return (
    <button
      type="button"
      className="sidebar-link sidebar-signout"
      onClick={handleSignOut}
      disabled={signingOut}
    >
      <LogOut size={14} />
      <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
    </button>
  );
}
