'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function AdminSignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
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
