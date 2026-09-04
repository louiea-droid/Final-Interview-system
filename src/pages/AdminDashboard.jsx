import { useEffect, useMemo, useRef, useState } from 'react';
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

// local stand-in for the backend; same query API, no network
import { localClient as supabase } from '../lib/localBackend';
import {
  formatCurrentDate,
  getEasternBatchStart,
  isSameDay,
  toDayKey,
} from '../lib/adminTime';
import { isShownOnBoard } from '../lib/candidateVisibility';
import CandidateDetailsModal from '../components/CandidateDetailsModal';
import TablePagination from '../components/TablePagination';
import { useToast } from '../components/ToastProvider';

/*
 * The list is scoped to one day, in the same zone the interview batches are
 * cut on, so "today" means the same thing here as it does everywhere else.
 */
const LIST_TIME_ZONE = 'America/New_York';

const statuses = [
  'Scheduled',
  'Completed',
  'Cancelled',
];

export default function AdminPage() {
  const [candidates, setCandidates] = useState([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const showToast = useToast();
  const [editingId, setEditingId] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [draggingCandidateId, setDraggingCandidateId] = useState(null);
  const batchStartKey = useRef(getEasternBatchStart().toISOString());

const [form, setForm] = useState({
  name: '',
  photo_file: null,
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
      showToast.error(
        batchResult.error?.message ?? totalResult.error?.message ?? 'Unable to load candidates.'
      );
    } else {
      setCandidates(batchResult.data ?? []);
      setTotalCandidates(totalResult.count ?? 0);
    }

    setLoading(false);
  }

  async function moveCandidate(draggedId, targetId) {
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
      showToast.error(`Unable to save candidate order: ${failedResult.error.message}`);
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

  async function handlePhotoChange(file) {
    if (!file) return;

    setProcessingPhoto(true);
    showToast.loading('Removing photo background...');

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
      showToast.success('Photo background removed.');
    } catch {
      setForm((current) => ({
        ...current,
        photo_file: file,
        no_photo: false,
      }));
      showToast.error('Background removal failed; using the original photo.');
    } finally {
      setProcessingPhoto(false);
    }
  }

async function saveCandidate(e) {
  e.preventDefault();

  if (processingPhoto || !editingId) return;

  const existingCandidate = candidates.find((candidate) => candidate.id === editingId);

  let photoUrl = form.no_photo
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
      showToast.error(`Photo upload failed: ${uploadError.message}`);
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
    showToast.error(error.message);
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
  showToast.success('Candidate updated successfully.');

  await loadCandidates();
}

  function startEditing(candidate) {
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
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from('candidates')
      .update({ status })
      .eq('id', id);

    if (error) {
      showToast.error(error.message);
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
    id,
    nextValue
  ) {
    const { error } = await supabase
      .from('candidates')
      .update({ show_in_visual: nextValue })
      .eq('id', id);

    if (error) {
      showToast.error(error.message);
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

  async function removeCandidate(id) {
    const { error } = await supabase
      .from('candidates')
      .delete()
      .eq('id', id);

    if (error) {
      showToast.error(error.message);
      return;
    }

    setCandidates((current) =>
      current.filter((candidate) => candidate.id !== id)
    );
    setCandidateToDelete(null);
  }

  /*
   * The list shows only candidates being interviewed today. Rows without an
   * interview date are left out rather than shown always, so the count in the
   * panel header and the pagination range agree with what is on screen.
   */
  const todaysCandidates = useMemo(
    () =>
      candidates.filter((candidate) =>
        isSameDay(candidate.interview_date, new Date(), LIST_TIME_ZONE)
      ),
    [candidates]
  );

  const pagedCandidates = useMemo(
    () => todaysCandidates.slice((page - 1) * pageSize, page * pageSize),
    [todaysCandidates, page, pageSize]
  );

  /*
   * Deleting the last row of the final page, or narrowing the page size,
   * would otherwise leave the view sitting past the end of the list.
   */
  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(todaysCandidates.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [todaysCandidates.length, page, pageSize]);

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
    const counts = new Map();

    candidates.forEach((candidate) => {
      const key = toDayKey(candidate.interview_date, LIST_TIME_ZONE) ?? 'unscheduled';
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
                Today's interviews and their live status.
              </p>
            </div>

          </div>

          <div className="panel-count">
            {todaysCandidates.length} candidate
            {todaysCandidates.length === 1 ? '' : 's'} today
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
                  <th>Visual Board</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {pagedCandidates.map((candidate) => (

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

                     <button
                       type="button"
                       className="candidate-info"
                       onClick={() => setViewingCandidate(candidate)}
                       aria-label={`View ${candidate.name}'s details`}
                     >

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

                      </button>

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

                {!pagedCandidates.length && (

                  <tr>

                    <td colSpan={5}>

                      <div className="empty-state">
                        No interviews scheduled for today.
                      </div>

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
            totalItems={todaysCandidates.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}

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

      {viewingCandidate && (
        <CandidateDetailsModal
          candidate={viewingCandidate}
          onClose={() => setViewingCandidate(null)}
        />
      )}

    </>
  );
}

/*
 * Both formatters take either a 'YYYY-MM-DD' key or a full timestamp -
 * splitting a timestamp on '-' used to leave the time stuck to the day.
 */
function formatDateValue(date) {
  const key = toDayKey(date, LIST_TIME_ZONE);
  if (!key) return '--';

  const [year, month, day] = key.split('-');
  return `${month}/${day}/${year}`;
}

function formatShortDate(date) {
  const key = toDayKey(date, LIST_TIME_ZONE);
  if (!key) return '--';

  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/*
 * A single rounded-top, square-baseline bar, drawn as a path so the
 * bottom two corners stay sharp against the shared baseline while
 * the top two round off.
 */
function roundedTopBarPath(x, y, width, height, radius) {
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

/*
 * Candidates per interview date.
 *
 * One series, so one hue and no legend - the panel title names it. The y
 * gridlines carry the magnitudes, which is why only the tallest bar, today's,
 * and the hovered one are labelled rather than every bar.
 *
 * Geometry is computed from the measured pixel width rather than drawn in a
 * fixed viewBox and scaled: scaling a viewBox to fit stretches the text and
 * the bars with it, which is what made this chart look smeared.
 */
function InterviewDateChart({ data }) {
  const [hovered, setHovered] = useState(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    const measure = () => setWidth(node.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const HEIGHT = 158;
  const PAD = { top: 18, right: 6, bottom: 34, left: 28 };

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;

  const peak = Math.max(...data.map((point) => point.count), 1);

  // round the axis up to a number a person would have chosen
  const step = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : 10;
  const axisMax = Math.ceil(peak / step) * step;
  const ticks = [...new Set([0, axisMax / 2, axisMax])].filter(Number.isInteger);

  const band = data.length > 0 ? plotWidth / data.length : 0;
  const barWidth = Math.min(34, Math.max(5, band - 14));

  const todayKey = toDayKey(new Date(), LIST_TIME_ZONE);
  const peakIndex = data.findIndex((point) => point.count === peak);

  // keep x labels from colliding once the bands get narrow
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1;

  const summary = data
    .map((point) => `${formatDateValue(point.date)}: ${point.count}`)
    .join(', ');

  const active = hovered === null ? null : data[hovered];

  return (
    <div className="interview-chart-figure" ref={wrapRef}>
      {width > 0 && (
        <svg
          role="img"
          aria-label={`Candidates by interview date - ${summary}`}
          width={width}
          height={HEIGHT}
          className="interview-chart"
        >
          {ticks.map((tick) => {
            const y = baseline - (tick / axisMax) * plotHeight;

            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={width - PAD.right}
                  y2={y}
                  className={tick === 0 ? 'chart-axis' : 'chart-grid'}
                />
                <text x={PAD.left - 8} y={y + 3.5} className="chart-tick">
                  {tick}
                </text>
              </g>
            );
          })}

          {data.map((point, index) => {
            const height = (point.count / axisMax) * plotHeight;
            const x = PAD.left + index * band + (band - barWidth) / 2;
            const y = baseline - height;

            const isToday = point.date === todayKey;
            const isHovered = hovered === index;
            const labelled = isToday || index === peakIndex || isHovered;

            return (
              <g key={point.date}>
                <path
                  d={roundedTopBarPath(x, y, barWidth, height, 4)}
                  className={`interview-chart-bar${isToday ? ' is-today' : ''}${
                    isHovered ? ' is-hovered' : ''
                  }`}
                />

                {labelled && height > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="interview-chart-value"
                  >
                    {point.count}
                  </text>
                )}

                {index % labelEvery === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={baseline + 15}
                    textAnchor="middle"
                    className={`interview-chart-label${isToday ? ' is-today' : ''}`}
                  >
                    {formatShortDate(point.date)}
                  </text>
                )}

                {isToday && (
                  <text
                    x={x + barWidth / 2}
                    y={baseline + 27}
                    textAnchor="middle"
                    className="interview-chart-today"
                  >
                    TODAY
                  </text>
                )}

                {/* a hit target spanning the band, not just the bar */}
                <rect
                  x={PAD.left + index * band}
                  y={PAD.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {active && (
        <div
          className="chart-tooltip"
          style={{ left: `${PAD.left + hovered * band + band / 2}px` }}
          role="status"
        >
          <strong>{formatDateValue(active.date)}</strong>
          <span>
            {active.count} candidate{active.count === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  );
}

function getStatusClass(status) {
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
