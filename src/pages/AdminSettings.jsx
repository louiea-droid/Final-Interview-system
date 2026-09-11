import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, KeyRound, LogOut, MonitorCog, Save } from 'lucide-react';

import { currentUser, signOut } from '../lib/localAuth';

const defaultSettings = {
  lightMode: false,
};

/*
 * The board's own light/dark toggle (also reachable from the sun/moon icon
 * in the sidebar - this is just the documented, discoverable home for the
 * same setting) is the only thing here that actually changes anything.
 * Everything this page used to offer beyond it - a board title, auto-rotate,
 * compact cards, a whole admin profile form with an avatar upload - wrote to
 * localStorage and showed "Saved", but nothing in the app ever read any of
 * it back. The board's title is already editable, for real, as the
 * "heading" text element in the Visual Board editor; duplicating it here
 * would just be a second, competing source of truth for the same text.
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = currentUser();

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/admin/login', { replace: true });
  }

  useEffect(() => {
    const storedSettings = window.localStorage.getItem('interview-board-settings');

    if (storedSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });
      } catch {
        window.localStorage.removeItem('interview-board-settings');
      }
    }
  }, []);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function saveSettings(event) {
    event.preventDefault();
    window.localStorage.setItem('interview-board-settings', JSON.stringify(settings));
    window.dispatchEvent(new Event('interview-board-settings-updated'));
    setSaved(true);
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="greeting-subtitle">Configure the interview board experience.</p>
        </div>
      </header>

      <form onSubmit={saveSettings}>
        <section className="panel form-panel">
          <div className="panel-header">
            <div className="panel-title-area">
              <div className="panel-title-icon">
                <MonitorCog size={14} />
              </div>
              <div>
                <h2 className="panel-title">Board Settings</h2>
                <p className="panel-subtitle">Control what candidates see on the visual board.</p>
              </div>
            </div>
          </div>

          <div className="form-container settings-options">
            <label className="settings-option">
              <span>
                <strong>Light mode</strong>
                <small>Switch the visual board and admin panel to a light theme.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.lightMode}
                onChange={(event) => updateSetting('lightMode', event.target.checked)}
              />
            </label>
          </div>
        </section>

        <div className="settings-actions">
          <button type="submit" className="primary-button">
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
          {saved && <span className="settings-saved">Settings saved</span>}
        </div>
      </form>

      <section className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <KeyRound size={14} />
            </div>
            <div>
              <h2 className="panel-title">Account</h2>
              <p className="panel-subtitle">The admin session for this browser.</p>
            </div>
          </div>
        </div>

        <div className="form-container settings-options">
          <div className="settings-option">
            <span>
              <strong>Signed in as {user?.username ?? 'Admin'}</strong>
              <small>
                This sign-in is a convenience, not a security boundary - the credentials it
                checks against ship in the app itself.
              </small>
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut size={13} />
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
