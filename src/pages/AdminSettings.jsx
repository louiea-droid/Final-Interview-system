'use client';

import { useEffect, useState } from 'react';
import { Check, CircleUserRound, MonitorCog, Save, SlidersHorizontal } from 'lucide-react';

const defaultSettings = {
  boardTitle: 'Final Interview Applicants',
  autoRotate: true,
  compactCards: false,
  lightMode: false,
};

const defaultProfile = {
  displayName: 'Admin',
  email: '',
  role: 'Administrator',
  timezone: 'Asia/Manila',
  avatarUrl: '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [profile, setProfile] = useState(defaultProfile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedSettings = window.localStorage.getItem('interview-board-settings');
    const storedProfile = window.localStorage.getItem('interview-admin-profile');

    if (storedSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });
      } catch {
        window.localStorage.removeItem('interview-board-settings');
      }
    }

    if (storedProfile) {
      try {
        setProfile({ ...defaultProfile, ...JSON.parse(storedProfile) });
      } catch {
        window.localStorage.removeItem('interview-admin-profile');
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
    window.localStorage.setItem('interview-admin-profile', JSON.stringify(profile));
    window.dispatchEvent(new Event('interview-admin-profile-updated'));
    setSaved(true);
  }

  function handleAvatarChange(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;

      setProfile((current) => ({ ...current, avatarUrl: reader.result}));
      setSaved(false);
    };
    reader.readAsDataURL(file);
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
                <CircleUserRound size={14} />
              </div>
              <div>
                <h2 className="panel-title">Admin Profile</h2>
                <p className="panel-subtitle">Update the details shown in the admin account menu.</p>
              </div>
            </div>
          </div>

          <div className="form-container">
            <div className="settings-avatar-field">
              <div className="settings-avatar-preview">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Admin avatar preview" />
                ) : (
                  <CircleUserRound size={24} />
                )}
              </div>

              <div className="settings-avatar-copy">
                <label className="form-label" htmlFor="admin-avatar">Profile avatar</label>
                <input
                  id="admin-avatar"
                  className="settings-avatar-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleAvatarChange(event.target.files?.[0] ?? null)}
                />
                <small>Choose a PNG, JPG, or WEBP image.</small>
              </div>
            </div>

            <div className="form-grid settings-profile-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="admin-display-name">Display name</label>
                <input
                  id="admin-display-name"
                  className="form-input"
                  required
                  value={profile.displayName}
                  onChange={(event) => {
                    setProfile((current) => ({ ...current, displayName: event.target.value }));
                    setSaved(false);
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-email">Email address</label>
                <input
                  id="admin-email"
                  className="form-input"
                  type="email"
                  placeholder="admin@example.com"
                  value={profile.email}
                  onChange={(event) => {
                    setProfile((current) => ({ ...current, email: event.target.value }));
                    setSaved(false);
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-role">Role</label>
                <input
                  id="admin-role"
                  className="form-input"
                  value={profile.role}
                  onChange={(event) => {
                    setProfile((current) => ({ ...current, role: event.target.value }));
                    setSaved(false);
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-timezone">Timezone</label>
                <select
                  id="admin-timezone"
                  className="form-select"
                  value={profile.timezone}
                  onChange={(event) => {
                    setProfile((current) => ({ ...current, timezone: event.target.value }));
                    setSaved(false);
                  }}
                >
                  <option value="Asia/Manila">Philippine Time</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          </div>
        </section>

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

          <div className="form-container">
            <div className="form-group">
              <label className="form-label" htmlFor="board-title">Board title</label>
              <input
                id="board-title"
                className="form-input"
                value={settings.boardTitle}
                onChange={(event) => updateSetting('boardTitle', event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="panel form-panel">
          <div className="panel-header">
            <div className="panel-title-area">
              <div className="panel-title-icon">
                <SlidersHorizontal size={14} />
              </div>
              <div>
                <h2 className="panel-title">Display Preferences</h2>
                <p className="panel-subtitle">Choose how the board rotates and arranges candidates.</p>
              </div>
            </div>
          </div>

          <div className="form-container settings-options">
            <label className="settings-option">
              <span>
                <strong>Auto-rotate candidate sets</strong>
                <small>Cycle through candidate groups automatically.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.autoRotate}
                onChange={(event) => updateSetting('autoRotate', event.target.checked)}
              />
            </label>

            <label className="settings-option">
              <span>
                <strong>Compact candidate cards</strong>
                <small>Use tighter spacing when more candidates are on screen.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.compactCards}
                onChange={(event) => updateSetting('compactCards', event.target.checked)}
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
    </>
  );
}
