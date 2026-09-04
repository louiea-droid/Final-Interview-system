import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import { signOut } from '../lib/localAuth';

export default function AdminSignOutButton() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
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
