'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserRound,
  Users,
  Sun,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  interview_type: string;
  interview_date: string | null;
  status: string;
  sort_order: number;
};

const statuses = [
  'Scheduled',
  'Waiting',
  'In Progress',
  'Completed',
  'Cancelled',
];

export default function AdminPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

const [form, setForm] = useState({
  name: '',
  photo_file: null as File | null,
  no_photo: false,
  position: '',
  interview_date: '',
  status: 'Scheduled',
});

  async function loadCandidates() {
    setLoading(true);

    const { data, count, error } = await supabase
      .from('candidates')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setMessage(error.message);
    } else {
      setCandidates(data ?? []);
      setTotalCandidates(count ?? data?.length ?? 0);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCandidates();
  }, []);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => setMessage(''), 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

async function saveCandidate(e: FormEvent) {
  e.preventDefault();

  setMessage('');

  const existingCandidate = editingId
    ? candidates.find((candidate) => candidate.id === editingId)
    : null;
  const nextOrder = candidates.length
    ? Math.max(...candidates.map((c) => c.sort_order)) + 1
    : 1;

  let photoUrl: string | null = form.no_photo
    ? null
    : existingCandidate?.photo_url ?? null;

  // Upload photo only when the user did not select "None"
  if (!form.no_photo && form.photo_file) {
    const file = form.photo_file;

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('Candidate-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      setMessage(`Photo upload failed: ${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage
      .from('Candidate-photos')
      .getPublicUrl(fileName);

    photoUrl = data.publicUrl;
  }

  const candidateDetails = {
    name: form.name,
    photo_url: photoUrl,
    position: form.position || null,
    interview_date: form.interview_date || null,
    status: form.status,
  };

  const { error } = editingId
    ? await supabase
        .from('candidates')
        .update(candidateDetails)
        .eq('id', editingId)
    : await supabase.from('candidates').insert({
        ...candidateDetails,
        interview_type: 'Final Interview',
        sort_order: nextOrder,
      });

  if (error) {
    setMessage(error.message);
    return;
  }

  setForm({
    name: '',
    photo_file: null,
    no_photo: false,
    position: '',
    interview_date: '',
    status: 'Scheduled',
  });

  setEditingId(null);
  setMessage(
    editingId
      ? 'Candidate updated successfully.'
      : 'Candidate added successfully.'
  );

  await loadCandidates();
}

  function startEditing(candidate: Candidate) {
    setEditingId(candidate.id);
    setForm({
      name: candidate.name,
      photo_file: null,
      no_photo: !candidate.photo_url,
      position: candidate.position ?? '',
      interview_date: candidate.interview_date ?? '',
      status: candidate.status,
    });
    setMessage('');
  }

  function cancelEditing() {
    setEditingId(null);
    setForm({
      name: '',
      photo_file: null,
      no_photo: false,
      position: '',
      interview_date: '',
      status: 'Scheduled',
    });
    setMessage('');
  }

  async function updateStatus(id: string, status: string) {
    setMessage('');

    const { error } = await supabase
      .from('candidates')
      .update({ status })
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? { ...candidate, status }
          : candidate
      )
    );
  }

  async function removeCandidate(id: string) {
    setMessage('');

    const { error } = await supabase
      .from('candidates')
      .delete()
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCandidates((current) =>
      current.filter((candidate) => candidate.id !== id)
    );
    setCandidateToDelete(null);
  }

  const stats = useMemo(() => {
    const total = totalCandidates;

    const scheduled = candidates.filter(
      (c) =>
        c.status === 'Scheduled' ||
        c.status === 'Waiting' ||
        c.status === 'In Progress'
    ).length;

    const completed = candidates.filter(
      (c) => c.status === 'Completed'
    ).length;

    return {
      total,
      scheduled,
      completed,
    };
  }, [candidates, totalCandidates]);

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
          

          <a className="sidebar-link active" href="/admin">
            <LayoutDashboard size={14} />
            <span>Dashboard</span>
          </a>

          <a className="sidebar-link" href="/admin/candidates">
            <Users size={14} />
            <span>Candidates</span>
          </a>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">MANAGEMENT</div>

          <div className="sidebar-link">
            <BarChart3 size={14} />
            <span>Analytics</span>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-section">
            <div className="sidebar-label">OTHERS</div>

            <div className="sidebar-link">
              <Settings size={14} />
              <span>Settings</span>
            </div>

            <div className="sidebar-link">
              <Sun size={14} />
              <span>Light Mode</span>

              <div className="mode-toggle">
                <div className="mode-toggle-circle"></div>
              </div>
            </div>
          </div>
        </div>

      </aside>

      {/* =========================================
          CONTENT
      ========================================= */}

      <main className="dashboard-content">

        {/* HEADER */}

        <header className="dashboard-header">

          <div>
            <h1 className="greeting-title">
              Final Interview Applicants
            </h1>

            <p className="greeting-subtitle">
               
            </p>
          </div>

          <div className="header-actions">

            <div className="timezone-clocks" aria-label="Current time">
              <div className="timezone-clock">
                <span className="timezone-label">PHILIPPINE TME</span>
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

            <div className="profile">
              <img
                className="profile-avatar"
                src="https://i.pravatar.cc/100?img=44"
                alt="Admin"
              />

              <span>Admin</span>
            </div>

          </div>

        </header>

        {/* =========================================
            METRICS
        ========================================= */}

        <section className="metric-grid">

          <div className="metric-card">

            <div className="metric-top">
              <div className="metric-icon">
                <Users size={14} />
              </div>

              Total Candidates
            </div>

            <div className="metric-value-row">
              <div className="metric-value">
                {stats.total}
              </div>

              <div className="metric-change">
                Live
              </div>
            </div>

            <div className="metric-description">
              Candidates currently in the system
            </div>

          </div>

          <div className="metric-card">

            <div className="metric-top">
              <div className="metric-icon">
                <Clock3 size={14} />
              </div>

              Active Interviews
            </div>

            <div className="metric-value-row">
              <div className="metric-value">
                {stats.scheduled}
              </div>

              <div className="metric-change">
                Active
              </div>
            </div>

            <div className="metric-description">
              Scheduled or currently being interviewed
            </div>

          </div>

          <div className="metric-card">

            <div className="metric-top">
              <div className="metric-icon">
                <CheckCircle2 size={14} />
              </div>

              Completed
            </div>

            <div className="metric-value-row">
              <div className="metric-value">
                {stats.completed}
              </div>

              <div className="metric-change">
                Done
              </div>
            </div>

            <div className="metric-description">
              Candidates who completed their interview
            </div>

          </div>

        </section>

        {/* =========================================
            ADD CANDIDATE
        ========================================= */}

        <section className="panel form-panel">

          <div className="panel-header">

            <div className="panel-title-area">

              <div className="panel-title-icon">
                <Plus size={12} />
              </div>

              <div>
                <h2 className="panel-title">
                  {editingId ? 'Edit Candidate' : 'Add Candidate'}
                </h2>

                <p className="panel-subtitle">
                  {editingId
                    ? "Update this candidate's interview details."
                    : 'Add a candidate to the interview queue.'}
                </p>
              </div>

            </div>

          </div>

          <form
            onSubmit={saveCandidate}
            className="form-container"
          >

            <div className="form-grid">

              <div className="form-group">
                <label className="form-label">
                  Candidate Name
                </label>

                <input
                  className="form-input"
                  required
                  placeholder="Enter candidate name"
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
  <label className="form-label">
    Candidate Photo
  </label>

  <div className="photo-upload">

    <label
      htmlFor="candidate-photo"
      className={`photo-upload-box ${
        form.no_photo ? 'disabled' : ''
      }`}
    >
      <input
        id="candidate-photo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={form.no_photo}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;

          setForm({
            ...form,
            photo_file: file,
            no_photo: false,
          });
        }}
      />

      <div className="photo-upload-content">

        {form.photo_file ? (
          <>
            <span className="photo-file-name">
              {form.photo_file.name}
            </span>

            <span className="photo-file-change">
              Change photo
            </span>
          </>
        ) : (
          <>
            <span className="photo-upload-title">
              Upload Photo
            </span>

            <span className="photo-upload-subtitle">
              PNG, JPG or WEBP
            </span>
          </>
        )}

      </div>
    </label>

    <label className="none-photo-option">
      <input
        type="checkbox"
        checked={form.no_photo}
        onChange={(e) =>
          setForm({
            ...form,
            no_photo: e.target.checked,
            photo_file: e.target.checked
              ? null
              : form.photo_file,
          })
        }
      />

      <span>None</span>
    </label>

  </div>
</div>


              <div className="form-group">
                <label className="form-label">
                  Position
                </label>

                <input
                  className="form-input"
                  placeholder="Position"
                  value={form.position}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      position: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Interview Date
                </label>

                <input
                  className="form-input"
                  type="date"
                  value={form.interview_date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      interview_date: e.target.value,
                    })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Starting Status
                </label>

                <select
                  className="form-select"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value,
                    })
                  }
                >
                  {statuses.map((status) => (
                    <option key={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary-button"
              >
                {editingId ? <Pencil size={12} /> : <Plus size={12} />}
                {editingId ? 'Save Changes' : 'Add Candidate'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={cancelEditing}
                >
                  Cancel
                </button>
              )}
            </div>

          </form>

        </section>

        {/* =========================================
            MESSAGE
        ========================================= */}

        {message && (
          <div className="message-box">
            {message}
          </div>
        )}

        {/* =========================================
            CANDIDATE LIST
        ========================================= */}

        <section className="panel table-panel">

          <div className="panel-header">

            <div className="panel-title-area">

              <div className="panel-title-icon">
                <Users size={12} />
              </div>

              <div>
                <h2 className="panel-title">
                  Candidate List
                </h2>

                <p className="panel-subtitle">
                  Manage candidates and their live interview status.
                </p>
              </div>

            </div>

            <div
              style={{
                color: '#726879',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              {candidates.length} candidate
              {candidates.length === 1 ? '' : 's'}
            </div>

          </div>

          <div className="table-wrapper">

            {loading ? (
              <div className="loading-state">
                Loading candidates...
              </div>
            ) : (
              <table className="candidate-table">

                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Interview Schedule</th>
                    <th>type</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>

                  {candidates.map((candidate) => (

                    <tr key={candidate.id}>

                      {/* CANDIDATE */}

                      <td>

                       <div className="candidate-info">

                         {candidate.photo_url ? (
  <img
    className="candidate-avatar"
    src={candidate.photo_url}
    alt={candidate.name}
  />
) : (
  <div className="candidate-avatar no-photo-avatar">
    <UserRound size={13} />
  </div>
)}

                         <div>
                            <div className="candidate-name">
                              {candidate.name}
                            </div>

                            <div className="candidate-position">
                              {candidate.position || 'No position'}
                            </div>

                          </div>

                        </div>

                      </td>


                  

                      {/* INTERVIEW */}

                      <td>

                        <div>
                          {candidate.interview_date || '—'}
                        </div>

                      </td>

                      {/* TYPE */}

                      <td>
                        <span
                          style={{
                            color: '#9d91a5',
                          }}
                        >
                          {candidate.interview_type}
                        </span>
                      </td>

                      {/* STATUS */}

                      <td>

                        <select
                          className={`status-select ${getStatusClass(
                            candidate.status
                          )}`}
                          value={candidate.status}
                          onChange={(e) =>
                            updateStatus(
                              candidate.id,
                              e.target.value
                            )
                          }
                        >
                          {statuses.map((status) => (
                            <option key={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                      </td>

                      {/* ACTIONS */}

                      <td>

                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => startEditing(candidate)}
                          aria-label={`Edit ${candidate.name}`}
                        >
                          <Pencil size={12} />
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => setCandidateToDelete(candidate)}
                          aria-label={`Remove ${candidate.name}`}
                        >
                          <Trash2 size={12} />
                        </button>

                      </td>

                    </tr>

                  ))}

                  {!candidates.length && (

                    <tr>

                      <td colSpan={5}>

                        <div className="empty-state">
                          No candidates yet. Add your first candidate above.
                        </div>

                      </td>

                    </tr>

                  )}

                </tbody>

              </table>
            )}

          </div>

        </section>

        {candidateToDelete && (
          <div className="confirmation-overlay" role="presentation">
            <div
              className="confirmation-popup"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-confirmation-title"
            >
              <h2 id="delete-confirmation-title">
                Are you sure you want to remove this candidate?
              </h2>

              <div className="confirmation-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCandidateToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-delete-button"
                  onClick={() => removeCandidate(candidateToDelete.id)}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function formatCurrentTime(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function getStatusClass(status: string) {
  switch (status) {
    case 'Scheduled':
      return 'status-scheduled';

    case 'Waiting':
      return 'status-waiting';

    case 'In Progress':
      return 'status-progress';

    case 'Completed':
      return 'status-completed';

    case 'Cancelled':
      return 'status-cancelled';

    default:
      return '';
  }
}