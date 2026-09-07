import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';

// local stand-in for the backend; same query API, no network
import { localClient as supabase } from '../lib/localBackend';
import { formatCurrentDate } from '../lib/adminTime';
import TablePagination from '../components/TablePagination';
import { useToast } from '../components/ToastProvider';

/** Whether an announcement should appear on the /visual board. */
function isShownOnBoard(announcement) {
  return announcement.active !== false;
}

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const showToast = useToast();

  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [announcementToDelete, setAnnouncementToDelete] = useState(null);

  async function loadAnnouncements() {
    setLoading(true);

    const { data, error } = await supabase
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

    setPosting(true);

    const { error } = await supabase.from('announcements').insert({
      message: trimmed,
      active: true,
    });

    setPosting(false);

    if (error) {
      showToast.error(error.message);
      return;
    }

    setMessage('');
    showToast.success('Announcement posted to the board.');
    await loadAnnouncements();
  }

  async function toggleActive(id, nextValue) {
    const { error } = await supabase
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
  }

  function cancelEditing() {
    setEditingId(null);
    setEditMessage('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingId) return;

    const trimmed = editMessage.trim();
    if (!trimmed) return;

    const { error } = await supabase
      .from('announcements')
      .update({ message: trimmed })
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
    const { error } = await supabase.from('announcements').delete().eq('id', id);

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

      <section className="panel form-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <Megaphone size={14} />
            </div>
            <div>
              <h2 className="panel-title">New Announcement</h2>
              <p className="panel-subtitle">
                Posted announcements show on the board right away.
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

          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={posting}>
              <Plus size={13} />
              {posting ? 'Posting...' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </section>

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
                  <th>Visual Board</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {pagedAnnouncements.map((announcement) => (
                  <tr key={announcement.id}>
                    <td>{announcement.message}</td>

                    <td>{formatCurrentDate(new Date(announcement.created_at), 'Asia/Manila')}</td>

                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isShownOnBoard(announcement)}
                        className={`visual-toggle ${isShownOnBoard(announcement) ? 'on' : ''}`}
                        onClick={() => toggleActive(announcement.id, !isShownOnBoard(announcement))}
                        aria-label={`${isShownOnBoard(announcement) ? 'Hide' : 'Show'} this announcement on the visual board`}
                      >
                        <span className="visual-toggle-track">
                          <span className="visual-toggle-thumb" />
                        </span>

                        <span className="visual-toggle-label">
                          {isShownOnBoard(announcement) ? 'Shown' : 'Hidden'}
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
                ))}

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
