'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  Menu,
  X,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';

import AdminSignOutButton from '../../../components/AdminSignOutButton';
import { formatCurrentTime } from '../../../lib/adminTime';

export default function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [adminProfile, setAdminProfile] = useState({
    displayName: 'Admin',
    role: 'Administrator',
    avatarUrl: '',
  });
  const [lightMode, setLightMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const loadTheme = () => {
      const storedSettings = window.localStorage.getItem('interview-board-settings');

      if (!storedSettings) return;

      try {
        const settings = JSON.parse(storedSettings);
        setLightMode(settings.lightMode === true);
      } catch {
        window.localStorage.removeItem('interview-board-settings');
      }
    };

    loadTheme();
    window.addEventListener('interview-board-settings-updated', loadTheme);

    return () => window.removeEventListener('interview-board-settings-updated', loadTheme);
  }, []);

  function toggleTheme() {
    const nextLightMode = !lightMode;
    setLightMode(nextLightMode);

    const storedSettings = window.localStorage.getItem('interview-board-settings');
    let settings = {};

    try {
      settings = storedSettings ? JSON.parse(storedSettings) : {};
    } catch {
      settings = {};
    }

    window.localStorage.setItem(
      'interview-board-settings',
      JSON.stringify({ ...settings, lightMode: nextLightMode })
    );
    window.dispatchEvent(new Event('interview-board-settings-updated'));
  }

  useEffect(() => {
    const loadAdminProfile = () => {
      const storedProfile = window.localStorage.getItem('interview-admin-profile');

      if (!storedProfile) return;

      try {
        const profile = JSON.parse(storedProfile);
        setAdminProfile((current) => ({
          displayName: typeof profile.displayName === 'string' && profile.displayName
            ? profile.displayName
            : current.displayName,
          role: typeof profile.role === 'string' && profile.role
            ? profile.role
            : current.role,
          avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : current.avatarUrl,
        }));
      } catch {
        window.localStorage.removeItem('interview-admin-profile');
      }
    };

    loadAdminProfile();
    window.addEventListener('interview-admin-profile-updated', loadAdminProfile);

    return () => window.removeEventListener('interview-admin-profile-updated', loadAdminProfile);
  }, []);

  return (
    <div className={`admin-layout ${lightMode ? 'light-mode' : ''}`}>

      {/* =========================================
          SIDEBAR
      ========================================= */}

      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>

        <div className="logo-area">
          <img
            className="logo-icon"
            src="/visual/HILLC-Petals.png"
            alt="Hyacinth logo"
          />
          <div className="logo-text">Hyacinth</div>
        </div>

        <div className="sidebar-section">

          <a
            className={`sidebar-link ${pathname === '/admin' ? 'active' : ''}`}
            href="/admin"
            onClick={() => setSidebarOpen(false)}
          >
            <LayoutDashboard size={17} strokeWidth={2.2} />
            <span>Dashboard</span>
          </a>

          <a
            className={`sidebar-link ${pathname.startsWith('/admin/records') ? 'active' : ''}`}
            href="/admin/records"
            onClick={() => setSidebarOpen(false)}
          >
            <ClipboardList size={17} strokeWidth={2.2} />
            <span>Records</span>
          </a>

          <a
            className={`sidebar-link ${pathname.startsWith('/admin/settings') ? 'active' : ''}`}
            href="/admin/settings"
            onClick={() => setSidebarOpen(false)}
          >
            <Settings size={17} strokeWidth={2.2} />
            <span>Settings</span>
          </a>
        </div>

        <div className="sidebar-account">
          <div className="sidebar-profile">
            <span className="profile-avatar profile-avatar-icon">
              {adminProfile.avatarUrl ? (
                <img src={adminProfile.avatarUrl} alt="" className="profile-avatar-image" />
              ) : (
                <CircleUserRound size={18} strokeWidth={2} />
              )}
            </span>

            <div className="sidebar-profile-details">
              <strong>{adminProfile.displayName}</strong>
              <span>{adminProfile.role}</span>
            </div>
          </div>

          <AdminSignOutButton />
        </div>

      </aside>

      {/* =========================================
          CONTENT
      ========================================= */}

      <main className="dashboard-content">

        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <div className="admin-topbar">

          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setSidebarOpen((current) => !current)}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <button
            type="button"
            className={`theme-switch ${lightMode ? 'on' : ''}`}
            onClick={toggleTheme}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-pressed={lightMode}
          >
            {lightMode ? <Sun size={14} /> : <Moon size={14} />}
            <span>{lightMode ? 'Light' : 'Dark'}</span>
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
          </button>

          <div className="timezone-clocks" aria-label="Current time">
            <div className="timezone-clock">
              <span className="timezone-label">PHILIPPINE TIME</span>
              <span>
                {currentTime
                  ? formatCurrentTime(currentTime, 'Asia/Manila')
                  : 'Loading...'}
              </span>
            </div>

            <div className="timezone-clock">
              <span className="timezone-label">EASTERN TIME</span>
              <span>
                {currentTime
                  ? formatCurrentTime(currentTime)
                  : 'Loading...'}
              </span>
            </div>
          </div>

        </div>

        {children}

      </main>
    </div>
  );
}
