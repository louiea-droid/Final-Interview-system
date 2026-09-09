import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignVerticalSpaceAround,
  CalendarClock,
  Megaphone,
  MoveHorizontal,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react';

// local stand-in for the backend; same query API, no network
import { firebaseClient } from '../lib/firebaseBackend';
import { formatCurrentDate, formatScheduledTime } from '../lib/adminTime';
import TablePagination from '../components/TablePagination';
import { useToast } from '../components/ToastProvider';
import FillEditor from '../components/FillEditor';
import {
  DEFAULT_ANNOUNCEMENT_STYLE,
  normalizeAnnouncementStyle,
  resolveAnnouncementStyle,
  saveAnnouncementStyle,
  subscribeAnnouncementStyle,
} from '../lib/announcementStyle';
import { CASE_OPTIONS, FONT_OPTIONS, SHADOW_OPTIONS, WEIGHT_OPTIONS } from '../lib/textStyle';
import { isShownOnBoard, isUpcoming } from '../lib/announcementVisibility';
import DateTimeField from '../components/DateTimeField';

const TABLE_TIME_ZONE = 'Asia/Manila';

/*
 * <input type="datetime-local"> reads and writes local wall-clock time with
 * no timezone info at all, so converting straight through `new Date(...)`
 * (UTC-ish parsing) would silently shift the value by the browser's offset.
 * These round-trip a Date through the browser's own local time instead.
 */
function toDateTimeLocal(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* One representative shade from each row of the fill editor's full palette,
   for a one-click swatch in the toolbar - the full palette (plus gradients
   and images) is still one click away behind the palette button. */
const QUICK_COLORS = ['#f4ca5d', '#ffffff', '#a51d1d', '#2f8fd6', '#8b5bf5'];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const showToast = useToast();

  const [message, setMessage] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [posting, setPosting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [editScheduleEnabled, setEditScheduleEnabled] = useState(false);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);

  /*
   * How announcements look on the board - saved straight to Firestore as
   * each control changes, same as the light/dark theme toggle, since there's
   * no draft/publish step here. subscribeAnnouncementStyle keeps this in
   * sync with any other admin tab or device too.
   */
  const [style, setStyle] = useState(DEFAULT_ANNOUNCEMENT_STYLE);

  useEffect(() => {
    return subscribeAnnouncementStyle(setStyle);
  }, []);
  // The fill popover renders through a portal (see below) since the panel
  // it lives in clips overflow for its rounded corners - a plain absolutely
  // positioned child would be cut off instead of floating above the page.
  const [fillPopoverPos, setFillPopoverPos] = useState(null);
  const fillButtonRef = useRef(null);
  const fillPopoverRef = useRef(null);

  function toggleFillPopover() {
    if (fillPopoverPos) {
      setFillPopoverPos(null);
      return;
    }

    const rect = fillButtonRef.current.getBoundingClientRect();
    setFillPopoverPos({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - 260),
    });
  }

  // Closes the fill popover on an outside click, same as any other dropdown.
  useEffect(() => {
    if (!fillPopoverPos) return;

    function handlePointerDown(event) {
      if (fillButtonRef.current?.contains(event.target)) return;
      if (fillPopoverRef.current?.contains(event.target)) return;
      setFillPopoverPos(null);
    }

    function handleScroll() {
      setFillPopoverPos(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [fillPopoverPos]);

  function updateStyle(patch) {
    setStyle((current) => {
      const next = normalizeAnnouncementStyle({ ...current, ...patch });
      saveAnnouncementStyle(next);
      return next;
    });
  }

  function resetStyle() {
    setStyle(DEFAULT_ANNOUNCEMENT_STYLE);
    saveAnnouncementStyle(DEFAULT_ANNOUNCEMENT_STYLE);
    showToast.success('Announcement style reset to default.');
  }

  async function loadAnnouncements() {
    setLoading(true);

    const { data, error } = await firebaseClient
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showToast.error(error.message);
    } else {
      setAnnouncements(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function postAnnouncement(event) {
    event.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) return;
    if (scheduleEnabled && !scheduledAt) return;

    setPosting(true);

    const { error } = await firebaseClient.from('announcements').insert({
      message: trimmed,
      active: true,
      scheduled_at: scheduleEnabled ? fromDateTimeLocal(scheduledAt) : null,
    });

    setPosting(false);

    if (error) {
      showToast.error(error.message);
      return;
    }

    setMessage('');
    setScheduleEnabled(false);
    setScheduledAt('');
    showToast.success(
      scheduleEnabled && scheduledAt
        ? 'Announcement scheduled.'
        : 'Announcement posted to the board.'
    );
    await loadAnnouncements();
  }

  async function toggleActive(id, nextValue) {
    const { error } = await firebaseClient
      .from('announcements')
      .update({ active: nextValue })
      .eq('id', id);

    if (error) {
      showToast.error(error.message);
      return;
    }

    setAnnouncements((current) =>
      current.map((announcement) =>
        announcement.id === id ? { ...announcement, active: nextValue } : announcement
      )
    );
  }

  function startEditing(announcement) {
    setEditingId(announcement.id);
    setEditMessage(announcement.message);
    setEditScheduleEnabled(Boolean(announcement.scheduled_at));
    setEditScheduledAt(toDateTimeLocal(announcement.scheduled_at));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditMessage('');
    setEditScheduleEnabled(false);
    setEditScheduledAt('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingId) return;

    const trimmed = editMessage.trim();
    if (!trimmed) return;
    if (editScheduleEnabled && !editScheduledAt) return;

    const { error } = await firebaseClient
      .from('announcements')
      .update({
        message: trimmed,
        scheduled_at: editScheduleEnabled ? fromDateTimeLocal(editScheduledAt) : null,
      })
      .eq('id', editingId);

    if (error) {
      showToast.error(error.message);
      return;
    }

    showToast.success('Announcement updated.');
    cancelEditing();
    await loadAnnouncements();
  }

  async function removeAnnouncement(id) {
    const { error } = await firebaseClient.from('announcements').delete().eq('id', id);

    if (error) {
      showToast.error(error.message);
      return;
    }

    setAnnouncements((current) => current.filter((announcement) => announcement.id !== id));
    setAnnouncementToDelete(null);
  }

  const pagedAnnouncements = useMemo(
    () => announcements.slice((page - 1) * pageSize, page * pageSize),
    [announcements, page, pageSize]
  );

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(announcements.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [announcements.length, page, pageSize]);

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="greeting-subtitle">
            Post messages that appear live on the visual board.
          </p>
        </div>
      </header>

      <div className="panel-columns">
      <section className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <Megaphone size={14} />
            </div>
            <div>
              <h2 className="panel-title">New Announcement</h2>
              <p className="panel-subtitle">
                Posted announcements show on the board right away, unless scheduled for later.
              </p>
            </div>
          </div>
        </div>

        <form className="form-container" onSubmit={postAnnouncement}>
          <div className="form-group">
            <label className="form-label" htmlFor="announcement-message">
              Message
            </label>
            <textarea
              id="announcement-message"
              className="form-input form-textarea"
              rows={3}
              required
              maxLength={240}
              placeholder="e.g. Final interviews resume at 1:00 PM."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="settings-option">
              <span className="settings-option-label">
                <CalendarClock size={13} />
                Schedule for later
              </span>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
              />
            </label>

            {scheduleEnabled && (
              <DateTimeField
                value={scheduledAt}
                onChange={setScheduledAt}
                min={toDateTimeLocal(new Date().toISOString())}
                placeholder="Select date and time"
              />
            )}
          </div>

          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={posting}>
              <Plus size={13} />
              {posting
                ? 'Posting...'
                : scheduleEnabled
                  ? 'Schedule Announcement'
                  : 'Post Announcement'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <Type size={14} />
            </div>
            <div>
              <h2 className="panel-title">Announcement Style</h2>
              <p className="panel-subtitle">
                How the message looks in the board's announcement banner.
              </p>
            </div>
          </div>
        </div>

        <div className="form-container">
          <div className="announcement-toolbar">
            <div className="announcement-toolbar-group">
              <select
                className="announcement-toolbar-select announcement-toolbar-select-wide"
                title="Font"
                aria-label="Font"
                value={style.fontFamily}
                onChange={(event) => updateStyle({ fontFamily: event.target.value })}
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={{ fontFamily: option.stack }}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="announcement-toolbar-select"
                title="Weight"
                aria-label="Weight"
                value={style.weight}
                onChange={(event) => updateStyle({ weight: Number(event.target.value) })}
              >
                {WEIGHT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="announcement-toolbar-select"
                title="Case"
                aria-label="Case"
                value={style.textCase}
                onChange={(event) => updateStyle({ textCase: event.target.value })}
              >
                {CASE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="announcement-toolbar-select"
                title="Shadow"
                aria-label="Shadow"
                value={style.shadow}
                onChange={(event) => updateStyle({ shadow: event.target.value })}
              >
                {SHADOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="announcement-toolbar-group">
              <label className="announcement-toolbar-slider" title="Size">
                <Type size={13} />
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="0.1"
                  aria-label="Size"
                  value={style.fontSize}
                  onChange={(event) => updateStyle({ fontSize: Number(event.target.value) })}
                />
                <span className="announcement-toolbar-slider-value">{style.fontSize.toFixed(1)}</span>
              </label>

              <label className="announcement-toolbar-slider" title="Letter spacing">
                <MoveHorizontal size={13} />
                <input
                  type="range"
                  min="-0.05"
                  max="0.4"
                  step="0.005"
                  aria-label="Letter spacing"
                  value={style.letterSpacing}
                  onChange={(event) => updateStyle({ letterSpacing: Number(event.target.value) })}
                />
                <span className="announcement-toolbar-slider-value">
                  {style.letterSpacing.toFixed(2)}em
                </span>
              </label>

              <label className="announcement-toolbar-slider" title="Line height">
                <AlignVerticalSpaceAround size={13} />
                <input
                  type="range"
                  min="0.9"
                  max="2"
                  step="0.05"
                  aria-label="Line height"
                  value={style.lineHeight}
                  onChange={(event) => updateStyle({ lineHeight: Number(event.target.value) })}
                />
                <span className="announcement-toolbar-slider-value">{style.lineHeight.toFixed(2)}</span>
              </label>
            </div>

            <div className="announcement-toolbar-group announcement-toolbar-swatches">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`announcement-toolbar-swatch ${
                    style.fill.type === 'solid' && style.fill.color === color ? 'active' : ''
                  }`}
                  style={{ background: color }}
                  title={color}
                  aria-label={`Fill ${color}`}
                  onClick={() => updateStyle({ fill: { type: 'solid', color, opacity: 1 } })}
                />
              ))}

              <button
                ref={fillButtonRef}
                type="button"
                className={`announcement-toolbar-icon-button ${fillPopoverPos ? 'active' : ''}`}
                title="More colors"
                aria-label="More colors"
                aria-expanded={Boolean(fillPopoverPos)}
                onClick={toggleFillPopover}
              >
                <Palette size={13} />
              </button>

              {fillPopoverPos &&
                createPortal(
                  <div
                    ref={fillPopoverRef}
                    className="announcement-toolbar-popover"
                    style={{ top: fillPopoverPos.top, left: fillPopoverPos.left }}
                  >
                    <FillEditor fill={style.fill} onChange={(fill) => updateStyle({ fill })} />
                  </div>,
                  document.body
                )}
            </div>

            <button
              type="button"
              className="announcement-toolbar-icon-button announcement-toolbar-reset"
              title="Reset to default"
              aria-label="Reset to default"
              onClick={resetStyle}
            >
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="announcement-style-preview">
            <Megaphone size={18} className="announcement-style-preview-icon" aria-hidden="true" />
            <p style={resolveAnnouncementStyle(style)}>
              {message.trim() || 'Final interviews resume at 1:00 PM.'}
            </p>
          </div>
        </div>
      </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <Megaphone size={12} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="panel-title">Announcements</h2>
              <p className="panel-subtitle">Everything posted so far, newest first.</p>
            </div>
          </div>

          <div className="panel-count">
            {announcements.length} announcement{announcements.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="table-wrapper">
          {loading ? (
            <div className="loading-state">Loading announcements...</div>
          ) : (
            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Posted</th>
                  <th>Schedule</th>
                  <th>Visual Board</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {pagedAnnouncements.map((announcement) => {
                  const active = announcement.active !== false;

                  return (
                  <tr key={announcement.id}>
                    <td>{announcement.message}</td>

                    <td>{formatCurrentDate(new Date(announcement.created_at), 'Asia/Manila')}</td>

                    <td>
                      {announcement.scheduled_at ? (
                        <span
                          className={`schedule-badge ${isUpcoming(announcement) ? 'upcoming' : 'passed'}`}
                        >
                          <CalendarClock size={12} />
                          {formatScheduledTime(new Date(announcement.scheduled_at), TABLE_TIME_ZONE)}
                        </span>
                      ) : (
                        <span className="schedule-badge-none">Immediately</span>
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        className={`visual-toggle ${active ? 'on' : ''}`}
                        onClick={() => toggleActive(announcement.id, !active)}
                        aria-label={`${active ? 'Hide' : 'Show'} this announcement on the visual board`}
                      >
                        <span className="visual-toggle-track">
                          <span className="visual-toggle-thumb" />
                        </span>

                        <span className="visual-toggle-label">
                          {isShownOnBoard(announcement) ? 'Shown' : active ? 'Scheduled' : 'Hidden'}
                        </span>
                      </button>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => startEditing(announcement)}
                        aria-label="Edit announcement"
                      >
                        <Pencil size={12} />
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => setAnnouncementToDelete(announcement)}
                        aria-label="Remove announcement"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                  );
                })}

                {!pagedAnnouncements.length && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">No announcements posted yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {!loading && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={announcements.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="announcements"
          />
        )}
      </section>

      {editingId && (
        <div className="confirmation-overlay">
          <form
            className="candidate-edit-popup"
            onSubmit={saveEdit}
            aria-labelledby="edit-announcement-title"
          >
            <h2 id="edit-announcement-title">Edit Announcement</h2>

            <label className="form-label" htmlFor="edit-announcement-message">
              Message
            </label>
            <textarea
              id="edit-announcement-message"
              className="form-input form-textarea"
              rows={4}
              required
              maxLength={240}
              value={editMessage}
              onChange={(event) => setEditMessage(event.target.value)}
            />

            <label className="settings-option">
              <span className="settings-option-label">
                <CalendarClock size={13} />
                Schedule for later
              </span>
              <input
                type="checkbox"
                checked={editScheduleEnabled}
                onChange={(event) => setEditScheduleEnabled(event.target.checked)}
              />
            </label>

            {editScheduleEnabled && (
              <DateTimeField
                value={editScheduledAt}
                onChange={setEditScheduledAt}
                min={toDateTimeLocal(new Date().toISOString())}
                placeholder="Select date and time"
              />
            )}

            <div className="confirmation-actions">
              <button type="button" className="secondary-button" onClick={cancelEditing}>
                Cancel
              </button>
              <button type="submit" className="confirm-delete-button">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {announcementToDelete && (
        <div className="confirmation-overlay" role="presentation">
          <div
            className="confirmation-popup"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-announcement-title"
          >
            <h2 id="delete-announcement-title">
              Are you sure you want to remove this announcement?
            </h2>

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAnnouncementToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-delete-button"
                onClick={() => removeAnnouncement(announcementToDelete.id)}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
