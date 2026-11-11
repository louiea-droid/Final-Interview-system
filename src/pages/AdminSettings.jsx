import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, MonitorCog } from 'lucide-react';

import { currentUser, signOut } from '../lib/firebase/auth';
import { DEFAULT_BOARD_SETTINGS, saveBoardSettings, subscribeBoardSettings } from '../lib/boardSettings';
import { useToast } from '../components/ToastProvider';
import TimeField from '../components/TimeField';

const BOARD_OPTIONS = [
  {
    key: 'hideEmptyCandidates',
    title: 'Hide the candidate box when nobody is listed',
    hint: 'Instead of showing "No final interview applicants currently listed."',
  },
  {
    key: 'hidePastCandidates',
    title: 'Hide candidates after their interview date',
    hint: 'Philippine time. Candidates with no interview date always stay.',
  },
];

/*
 * Board settings are stored online, so every screen running /visual follows
 * them the moment a switch moves - there's nothing to Save. The admin
 * panel's light/dark theme is the sun/moon switch in the sidebar.
 *
 * The board's title and card speed aren't here on purpose: they're edited
 * for real in the Visual Board editor, and a second place to change them
 * would just compete with it.
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const showToast = useToast();
  const [boardSettings, setBoardSettings] = useState(DEFAULT_BOARD_SETTINGS);
  const [signingOut, setSigningOut] = useState(false);
  const user = currentUser();

  useEffect(() => subscribeBoardSettings(setBoardSettings), []);

  function updateBoardSetting(key, value) {
    saveBoardSettings({ ...boardSettings, [key]: value }).catch(() => {
      showToast.error('Could not save that board setting - check that you are signed in as an admin.');
    });
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/admin/login', { replace: true });
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="greeting-subtitle">Configure the interview board experience.</p>
        </div>
      </header>

      <section className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <MonitorCog size={14} />
            </div>
            <div>
              <h2 className="panel-title">Live Board</h2>
              <p className="panel-subtitle">
                Saved online - every screen showing the board follows these straight away.
              </p>
            </div>
          </div>
        </div>

        <div className="form-container settings-options">
          {BOARD_OPTIONS.map(({ key, title, hint }) => (
            <label key={key} className="settings-option settings-option-check" htmlFor={`board-setting-${key}`}>
              <input
                id={`board-setting-${key}`}
                type="checkbox"
                className="settings-checkbox"
                checked={boardSettings[key]}
                onChange={(event) => updateBoardSetting(key, event.target.checked)}
              />
              <span>
                <strong>{title}</strong>
                <small>{hint}</small>
                {key === 'hidePastCandidates' && boardSettings.hidePastCandidates && (
                  /* clicks on this row's own text shouldn't flip the switch it sits in */
                  <span
                    className="settings-option-time"
                    onClick={(event) => event.target === event.currentTarget && event.preventDefault()}
                  >
                    Leaves the board at
                    <TimeField
                      label="Time on the interview day"
                      value={boardSettings.hidePastTime}
                      onChange={(time) => updateBoardSetting('hidePastTime', time)}
                    />
                    on their interview day
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

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
              <strong>Signed in as {user?.email ?? 'Admin'}</strong>
              <small>
                Only admin accounts listed in the database security rules can make changes;
                anyone else can view the board but not edit it.
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
