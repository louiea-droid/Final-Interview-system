import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  LayoutDashboard,
  Menu,
  X,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from 'lucide-react';

import AdminSignOutButton from '../components/AdminSignOutButton';
import { formatCurrentTime } from '../lib/adminTime';

const COLLAPSE_KEY = 'interview-sidebar-collapsed';

/*
 * The page title lives in the header rather than in each page, so it sits
 * beside the clocks and stays put while the page scrolls.
 */
function pageTitle(pathname) {
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  if (pathname.startsWith('/admin/records')) return 'Records';
  if (pathname.startsWith('/admin/history')) return 'Records';
  return 'Final Interview Applicants';
}

export default function AdminProtectedLayout() {
  // nested routes render through <Outlet /> where `children` used to go
  const { pathname } = useLocation();
  const [currentTime, setCurrentTime] = useState(null);
  const [lightMode, setLightMode] = useState(false);

  // the mobile drawer; separate from the desktop collapse below
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /*
   * Collapsing the sidebar to an icon rail is a deliberate choice, so it is
   * remembered - read during the first render to avoid the sidebar flashing
   * open before the stored preference is applied.
   */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* a browser refusing storage should not break the toggle */
      }
      return next;
    });
  }

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

  function applyTheme(nextLightMode) {
    if (nextLightMode === lightMode) return;

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

  const layoutClasses = [
    'admin-layout',
    lightMode ? 'light-mode' : '',
    collapsed ? 'sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClasses}>

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
            title={collapsed ? 'Dashboard' : undefined}
          >
            <LayoutDashboard size={19} strokeWidth={2.1} />
            <span>Dashboard</span>
          </a>

          <a
            className={`sidebar-link ${pathname.startsWith('/admin/records') ? 'active' : ''}`}
            href="/admin/records"
            onClick={() => setSidebarOpen(false)}
            title={collapsed ? 'Records' : undefined}
          >
            <ClipboardList size={19} strokeWidth={2.1} />
            <span>Records</span>
          </a>

          <a
            className={`sidebar-link ${pathname.startsWith('/admin/settings') ? 'active' : ''}`}
            href="/admin/settings"
            onClick={() => setSidebarOpen(false)}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings size={19} strokeWidth={2.1} />
            <span>Settings</span>
          </a>
        </div>

        <div className="sidebar-account">

          <button
            type="button"
            className="sidebar-link sidebar-theme-toggle"
            onClick={() => applyTheme(!lightMode)}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {lightMode ? (
              <Sun size={19} strokeWidth={2.1} />
            ) : (
              <Moon size={19} strokeWidth={2.1} />
            )}
            <span>{lightMode ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <span className="sidebar-separator" aria-hidden="true" />

          <button
            type="button"
            className="sidebar-link sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} strokeWidth={2.1} />
            ) : (
              <PanelLeftClose size={19} strokeWidth={2.1} />
            )}
            <span>{collapsed ? 'Expand' : 'Collapse'}</span>
          </button>

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

        {/* =========================================
            HEADER (sticky)
        ========================================= */}

        <header className="admin-header">

          <div className="admin-header-left">

            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X size={19} /> : <Menu size={19} />}
            </button>

            <h1 className="header-title">{pageTitle(pathname)}</h1>

          </div>

          <div className="admin-header-right">

            <div className="timezone-clocks" aria-label="Current time">
              <div className="timezone-clock">
                <span className="timezone-label">Philippine</span>
                <span className="timezone-value">
                  {currentTime
                    ? formatCurrentTime(currentTime, 'Asia/Manila')
                    : '--'}
                </span>
              </div>

              <span className="timezone-divider" aria-hidden="true" />

              <div className="timezone-clock">
                <span className="timezone-label">Eastern</span>
                <span className="timezone-value">
                  {currentTime
                    ? formatCurrentTime(currentTime, 'America/New_York')
                    : '--'}
                </span>
              </div>
            </div>

          </div>

        </header>

        <Outlet />

      </main>
    </div>
  );
}
