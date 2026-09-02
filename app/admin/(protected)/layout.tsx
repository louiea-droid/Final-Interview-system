'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  CircleUserRound,
  History,
  LayoutDashboard,
  Settings,
  Sun,
  TrendingUp,
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
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="admin-layout">

      {/* =========================================
          SIDEBAR
      ========================================= */}

      <aside className="sidebar">

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
          >
            <LayoutDashboard size={17} strokeWidth={2.2} />
            <span>Dashboard</span>
          </a>

          <a
            className={`sidebar-link ${pathname.startsWith('/admin/history') ? 'active' : ''}`}
            href="/admin/history"
          >
            <History size={17} strokeWidth={2.2} />
            <span>History</span>
          </a>

          <div className="sidebar-link">
            <TrendingUp size={17} strokeWidth={2.2} />
            <span>Analytics</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">OTHERS</div>

          <div className="sidebar-link">
            <Settings size={17} strokeWidth={2.2} />
            <span>Settings</span>
          </div>

          <div className="sidebar-link">
            <Sun size={17} strokeWidth={2.2} />
            <span>Light Mode</span>

            <div className="mode-toggle">
              <div className="mode-toggle-circle"></div>
            </div>
          </div>
        </div>

      </aside>

      {/* =========================================
          CONTENT
      ========================================= */}

      <main className="dashboard-content">

        <div className="admin-topbar">

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

          <button
            type="button"
            className="profile"
            onClick={() => setAccountPanelOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={accountPanelOpen}
          >
            <span className="profile-avatar profile-avatar-icon">
              <CircleUserRound size={18} strokeWidth={2} />
            </span>

            <span>Admin</span>
          </button>

        </div>

        {children}

        {accountPanelOpen && (
          <div
            className="account-drawer-overlay"
            role="presentation"
            onClick={() => setAccountPanelOpen(false)}
          >
            <aside
              className="account-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-drawer-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="account-drawer-close"
                onClick={() => setAccountPanelOpen(false)}
                aria-label="Close account menu"
              >
                &times;
              </button>

              <div className="account-drawer-header">
                <span className="profile-avatar profile-avatar-icon profile-avatar-lg">
                  <CircleUserRound size={26} strokeWidth={2} />
                </span>

                <div>
                  <div id="account-drawer-title" className="account-drawer-name">
                    Admin
                  </div>
                  <div className="account-drawer-role">Administrator</div>
                </div>
              </div>

              <div className="account-drawer-actions">
                <AdminSignOutButton />
              </div>
            </aside>
          </div>
        )}

      </main>
    </div>
  );
}
