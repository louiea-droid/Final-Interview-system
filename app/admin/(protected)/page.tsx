'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  GripVertical,
  MonitorPlay,
  Pencil,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import { formatCurrentDate, getEasternBatchStart } from '../../../lib/adminTime';
import { isShownOnBoard } from '../../../lib/candidateVisibility';

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  interview_type: string;
  interview_date: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  /*
   * Whether the candidate appears on the /visual board.
   *
   * Optional so rows saved before the show_in_visual column
   * existed still type-check; a missing value counts as shown.
   */
  show_in_visual?: boolean | null;
};

const statuses = [
  'Scheduled',
  'Completed',
  'Cancelled',
];

export default function AdminPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [draggingCandidateId, setDraggingCandidateId] = useState<string | null>(null);
  const batchStartKey = useRef(getEasternBatchStart().toISOString());

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

    const batchStart = getEasternBatchStart();
    const [batchResult, totalResult] = await Promise.all([
      supabase
        .from('candidates')
        .select('*')
        .or(`status.neq.Completed,created_at.gte.${batchStart.toISOString()}`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true }),
    ]);

    if (batchResult.error || totalResult.error) {
      setMessage(
        batchResult.error?.message ?? totalResult.error?.message ?? 'Unable to load candidates.'
      );
    } else {
      setCandidates(batchResult.data ?? []);
      setTotalCandidates(totalResult.count ?? 0);
    }

    setLoading(false);
  }

  async function moveCandidate(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;

    const draggedIndex = candidates.findIndex((candidate) => candidate.id === draggedId);
    const targetIndex = candidates.findIndex((candidate) => candidate.id === targetId);

    if (draggedIndex < 0 || targetIndex < 0) return;

    const reorderedCandidates = [...candidates];
    const [draggedCandidate] = reorderedCandidates.splice(draggedIndex, 1);
    const insertIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
    reorderedCandidates.splice(insertIndex, 0, draggedCandidate);
    const orderedCandidates = reorderedCandidates.map((candidate, index) => ({
      ...candidate,
      sort_order: index + 1,
    }));

    setCandidates(orderedCandidates);
    setMessage('');

    const results = await Promise.all(
      orderedCandidates.map((candidate) =>
        supabase
          .from('candidates')
          .update({ sort_order: candidate.sort_order })
          .eq('id', candidate.id)
      )
    );
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      setMessage(`Unable to save candidate order: ${failedResult.error.message}`);
      loadCandidates();
    }
  }

  useEffect(() => {
    loadCandidates();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextBatchStartKey = getEasternBatchStart().toISOString();

      if (nextBatchStartKey !== batchStartKey.current) {
        batchStartKey.current = nextBatchStartKey;
        loadCandidates();
      }
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!message) return;

    const timeoutId = window.setTimeout(() => setMessage(''), 5000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function handlePhotoChange(file: File | null) {
    if (!file) return;

    setProcessingPhoto(true);
    setMessage('Removing photo background...');

    try {
      const backgroundRemoved = await removeBackground(file);
      const processedFile = new File(
        [backgroundRemoved],
        `${file.name.replace(/\.[^.]+$/, '')}.png`,
        { type: 'image/png' }
      );

      setForm((current) => ({
        ...current,
        photo_file: processedFile,
        no_photo: false,
      }));
      setMessage('Photo background removed.');
    } catch {
      setForm((current) => ({
        ...current,
        photo_file: file,
        no_photo: false,
      }));
      setMessage('Background removal failed; using the original photo.');
    } finally {
      setProcessingPhoto(false);
    }
  }

async function saveCandidate(e: FormEvent) {
  e.preventDefault();

  if (processingPhoto || !editingId) return;

  setMessage('');

  const existingCandidate = candidates.find((candidate) => candidate.id === editingId);

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

  const { error } = await supabase
    .from('candidates')
    .update(candidateDetails)
    .eq('id', editingId);

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
  setEditModalOpen(false);
  setMessage('Candidate updated successfully.');

  await loadCandidates();
}

  function startEditing(candidate: Candidate) {
    setEditingId(candidate.id);
    setEditModalOpen(true);
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
    setEditModalOpen(false);
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

  async function toggleShowOnBoard(
    id: string,
    nextValue: boolean
  ) {
    setMessage('');

    const { error } = await supabase
      .from('candidates')
      .update({ show_in_visual: nextValue })
      .eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? { ...candidate, show_in_visual: nextValue }
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

    return {
      total,
      scheduled,
    };
  }, [candidates, totalCandidates]);

  const interviewDateBreakdown = useMemo(() => {
    const counts = new Map<string, number>();

    candidates.forEach((candidate) => {
      const key = candidate.interview_date || 'unscheduled';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const scheduled = Array.from(counts.entries())
      .filter(([date]) => date !== 'unscheduled')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      scheduled,
      unscheduledCount: counts.get('unscheduled') ?? 0,
    };
  }, [candidates]);

  return (
    <>

      {/* HEADER */}

      <header className="dashboard-header">
        <div>
          <h1 className="greeting-title">
            Final Interview Applicants
          </h1>
        </div>
      </header>

      {/* =========================================
          METRICS
      ========================================= */}

      <section className="metric-grid">

        <div className="metric-group">

          <div className="metric-group-top">

            <div className="metric-card">

              <div className="metric-top">
                <div className="metric-icon">
                  <UsersRound size={14} strokeWidth={2.2} />
                </div>

                Total Candidates
              </div>

              <div className="metric-value-row">
                <div className="metric-value">
                  {stats.total}
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
              </div>

              <div className="metric-description">
                Scheduled or currently being interviewed
              </div>

            </div>

          </div>

          <div className="metric-card metric-card--chart">

            <div className="metric-top">
              <div className="metric-icon">
                <CalendarDays size={14} strokeWidth={2.2} />
              </div>

              Interview Schedule
            </div>

            <div className="interview-chart-wrap">
              {interviewDateBreakdown.scheduled.length ? (
                <InterviewDateChart data={interviewDateBreakdown.scheduled} />
              ) : (
                <div className="empty-state">
                  No interview dates scheduled yet.
                </div>
              )}
            </div>

            {interviewDateBreakdown.unscheduledCount > 0 && (
              <div className="metric-description">
                {interviewDateBreakdown.unscheduledCount} not yet scheduled
              </div>
            )}

          </div>

        </div>

        <div className="visual-preview-card">

          <div className="visual-preview-header">
            <div className="visual-preview-title">
              <MonitorPlay size={14} strokeWidth={2.2} />
              Visual Board
              <span className="live-dot" aria-hidden="true" />
              <span className="visual-preview-live-label">Live</span>
            </div>

            <a
              href="/visual"
              target="_blank"
              rel="noopener noreferrer"
              className="visual-preview-link"
            >
              Open
              <ExternalLink size={11} />
            </a>
          </div>

          <div className="visual-preview-frame-wrap">
            <iframe
              src="/visual?preview=1"
              title="Visual board preview"
              className="visual-preview-frame"
              loading="lazy"
            />
          </div>

        </div>

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
              <UsersRound size={12} strokeWidth={2.2} />
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

          <div className="panel-count">
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
                  <th>Date Added</th>
                  <th>Status</th>
                  <th>Visual Board</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {candidates.map((candidate) => (

                  <tr
                    key={candidate.id}
                    className={draggingCandidateId === candidate.id ? 'dragging-row' : ''}
                    draggable
                    onDragStart={() => setDraggingCandidateId(candidate.id)}
                    onDragEnd={() => setDraggingCandidateId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggingCandidateId) {
                        void moveCandidate(draggingCandidateId, candidate.id);
                      }
                      setDraggingCandidateId(null);
                    }}
                  >

                    {/* CANDIDATE */}

                    <td>

                     <div className="candidate-info">

                       <span className="candidate-drag-handle" aria-label="Drag to reorder">
                         <GripVertical size={14} />
                       </span>

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
                        {candidate.interview_date
                          ? formatDateValue(candidate.interview_date)
                          : '—'}
                      </div>

                    </td>

                    {/* DATE ADDED */}

                    <td>
                      {formatCurrentDate(new Date(candidate.created_at), 'Asia/Manila')}
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

                    {/* VISUAL BOARD */}

                    <td>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isShownOnBoard(candidate)}
                        className={`visual-toggle ${
                          isShownOnBoard(candidate) ? 'on' : ''
                        }`}
                        onClick={() =>
                          toggleShowOnBoard(
                            candidate.id,
                            !isShownOnBoard(candidate)
                          )
                        }
                        aria-label={`${
                          isShownOnBoard(candidate) ? 'Hide' : 'Show'
                        } ${candidate.name} on the visual board`}
                      >
                        <span className="visual-toggle-track">
                          <span className="visual-toggle-thumb" />
                        </span>

                        <span className="visual-toggle-label">
                          {isShownOnBoard(candidate) ? 'Shown' : 'Hidden'}
                        </span>
                      </button>

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

                    <td colSpan={6}>

                      <div className="empty-state">
                        No candidates yet. Add one from the Records page.
                      </div>

                    </td>

                  </tr>

                )}

              </tbody>

            </table>
          )}

        </div>

      </section>

      {editModalOpen && editingId && (
        <div className="confirmation-overlay">
          <form
            className="candidate-edit-popup"
            onSubmit={saveCandidate}
            aria-labelledby="dashboard-edit-candidate-title"
          >
            <h2 id="dashboard-edit-candidate-title">Edit Candidate</h2>

            <label className="form-label" htmlFor="dashboard-edit-photo">
              Candidate Photo
            </label>
            <div className="photo-upload">
              <label
                htmlFor="dashboard-edit-photo"
                className={`photo-upload-box ${form.no_photo ? 'disabled' : ''}`}
              >
                <input
                  id="dashboard-edit-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={form.no_photo}
                  onChange={(event) => {
                    void handlePhotoChange(event.target.files?.[0] ?? null);
                  }}
                />
                <div className="photo-upload-content">
                  <span className="photo-upload-title">
                    {form.photo_file ? form.photo_file.name : 'Change photo'}
                  </span>
                  <span className="photo-upload-subtitle">PNG, JPG or WEBP</span>
                </div>
              </label>

              <label className="none-photo-option">
                <input
                  type="checkbox"
                  checked={form.no_photo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      no_photo: event.target.checked,
                      photo_file: event.target.checked ? null : current.photo_file,
                    }))
                  }
                />
                <span>None</span>
              </label>
            </div>

            <label className="form-label" htmlFor="dashboard-edit-name">
              Candidate Name
            </label>
            <input
              id="dashboard-edit-name"
              className="form-input"
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />

            <label className="form-label" htmlFor="dashboard-edit-position">
              Position
            </label>
            <input
              id="dashboard-edit-position"
              className="form-input"
              value={form.position}
              onChange={(event) =>
                setForm({ ...form, position: event.target.value })
              }
            />

            <label className="form-label" htmlFor="dashboard-edit-date">
              Interview Schedule
            </label>
            <input
              id="dashboard-edit-date"
              className="form-input"
              type="date"
              value={form.interview_date}
              onChange={(event) =>
                setForm({ ...form, interview_date: event.target.value })
              }
            />

            <label className="form-label" htmlFor="dashboard-edit-status">
              Status
            </label>
            <select
              id="dashboard-edit-status"
              className="form-select"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
            >
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
              >
                Cancel
              </button>
              <button type="submit" className="confirm-delete-button">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

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

    </>
  );
}

function formatDateValue(date: string) {
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/*
 * A single rounded-top, square-baseline bar, drawn as a path so the
 * bottom two corners stay sharp against the shared baseline while
 * the top two round off.
 */
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number) {
  if (height <= 0) return '';

  const r = Math.min(radius, width / 2, height);

  return `
    M ${x} ${y + height}
    L ${x} ${y + r}
    Q ${x} ${y} ${x + r} ${y}
    L ${x + width - r} ${y}
    Q ${x + width} ${y} ${x + width} ${y + r}
    L ${x + width} ${y + height}
    Z
  `;
}

function InterviewDateChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const barWidth = 28;
  const barGap = 16;
  const plotHeight = 110;
  const topPadding = 20;
  const bottomPadding = 20;

  const maxCount = Math.max(...data.map((point) => point.count), 1);
  const width = data.length * (barWidth + barGap) - barGap;
  const height = topPadding + plotHeight + bottomPadding;

  const summary = data
    .map((point) => `${formatDateValue(point.date)}: ${point.count}`)
    .join(', ');

  return (
    <svg
      role="img"
      aria-label={`Candidates by interview date — ${summary}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="interview-chart"
    >
      <line
        x1={0}
        y1={topPadding + plotHeight}
        x2={width}
        y2={topPadding + plotHeight}
        className="interview-chart-baseline"
      />

      {data.map((point, index) => {
        const barHeight = (point.count / maxCount) * (plotHeight - 10);
        const x = index * (barWidth + barGap);
        const y = topPadding + plotHeight - barHeight;

        return (
          <g key={point.date}>
            <title>
              {formatDateValue(point.date)}: {point.count} candidate{point.count === 1 ? '' : 's'}
            </title>

            <text
              x={x + barWidth / 2}
              y={y - 6}
              textAnchor="middle"
              className="interview-chart-value"
            >
              {point.count}
            </text>

            <path
              d={roundedTopBarPath(x, y, barWidth, barHeight, 4)}
              className="interview-chart-bar"
            />

            <text
              x={x + barWidth / 2}
              y={topPadding + plotHeight + 16}
              textAnchor="middle"
              className="interview-chart-label"
            >
              {formatShortDate(point.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
