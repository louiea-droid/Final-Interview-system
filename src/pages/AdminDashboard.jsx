import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Clock3,
  ExternalLink,
  GripVertical,
  Images,
  Megaphone,
  MonitorPlay,
  Pencil,
  UserPlus,
  UserRound,
  UsersRound,
} from 'lucide-react';

// local stand-in for the backend; same query API, no network
import { firebaseClient, subscribeAnnouncements, subscribeCandidates } from '../lib/firebaseBackend';
import {
  formatCurrentDate,
  formatScheduledTime,
  getEasternBatchStart,
  isSameDay,
  formatLongDate,
  toDayKey,
} from '../lib/adminTime';
import { isShownOnBoard as isCandidateShownOnBoard } from '../lib/candidateVisibility';
import { isShownOnBoard as isAnnouncementShownOnBoard, isUpcoming } from '../lib/announcementVisibility';
import { isVisible, subscribeBoardLayout } from '../lib/boardLayout';
import { isCarousel } from '../lib/shapeStyle';
import CandidateDetailsModal from '../components/CandidateDetailsModal';
import CandidatePhoto from '../components/CandidatePhoto';
import TablePagination from '../components/TablePagination';
import { useToast } from '../components/ToastProvider';

/*
 * The list is scoped to one day, in the same zone the interview batches are
 * cut on, so "today" means the same thing here as it does everywhere else.
 */
const LIST_TIME_ZONE = 'America/New_York';

export default function AdminPage() {
  const [candidates, setCandidates] = useState([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  /*
   * The table above only ever loads today's batch (see loadCandidates), but
   * "shown on the visual board" and "added today" need every candidate
   * regardless of batch, so those two stats ride the same live subscription
   * the public board itself uses.
   */
  const [allCandidates, setAllCandidates] = useState([]);
  const [boardLayout, setBoardLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const showToast = useToast();
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [draggingCandidateId, setDraggingCandidateId] = useState(null);
  const batchStartKey = useRef(getEasternBatchStart().toISOString());

  async function loadCandidates() {
    setLoading(true);

    const batchStart = getEasternBatchStart();
    const [batchResult, totalResult] = await Promise.all([
      firebaseClient
        .from('candidates')
        .select('*')
        .or(`status.neq.Completed,created_at.gte.${batchStart.toISOString()}`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      firebaseClient
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
        firebaseClient
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

  useEffect(() => {
    return subscribeAnnouncements(setAnnouncements);
  }, []);

  /*
   * A scheduled announcement going live, or an upcoming one falling off the
   * list, is purely a function of the clock - nothing about the Firestore
   * data itself changes at that moment, so nothing would otherwise trigger
   * a re-render right when it matters.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    return subscribeCandidates(setAllCandidates);
  }, []);

  useEffect(() => {
    return subscribeBoardLayout(setBoardLayout);
  }, []);

  async function updateStatus(id, status) {
    const { error } = await firebaseClient
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
    const { error } = await firebaseClient
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

    // Same rule the public board itself uses (isShownOnBoard), over every
    // candidate rather than just today's batch - a candidate hidden from
    // the board can still be part of today's list, and vice versa.
    const shownOnBoard = allCandidates.filter(isCandidateShownOnBoard).length;

    // Placeholder for the intern-tracking page that's coming later - for
    // now, "new" means added today.
    const newInterns = allCandidates.filter((c) =>
      isSameDay(c.created_at, new Date(), LIST_TIME_ZONE)
    ).length;

    return {
      total,
      shownOnBoard,
      newInterns,
    };
  }, [allCandidates, totalCandidates]);

  // Photos held by every visible photo-frame shape on the board - a static
  // frame counts its one photo, a carousel frame counts every photo it
  // cycles through.
  const picturesShown = useMemo(() => {
    if (!boardLayout) return 0;

    return boardLayout.shapes
      .filter((shape) => shape.kind === 'frame' && isVisible(shape))
      .reduce((sum, shape) => {
        if (isCarousel(shape)) return sum + shape.photos.length;
        return sum + (shape.fill?.type === 'image' && shape.fill.url ? 1 : 0);
      }, 0);
  }, [boardLayout]);

  // The board itself rotates through every announcement that's currently
  // live (on and, if scheduled, past its time), oldest first - the one
  // it's showing (or about to show) right now is whichever sorts first
  // under that same rule.
  const currentAnnouncement = useMemo(() => {
    const live = announcements
      .filter(isAnnouncementShownOnBoard)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return live[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, now]);

  // Switched on but still waiting on their scheduled time, soonest first -
  // set from the scheduler on the Announcements page.
  const upcomingAnnouncements = useMemo(() => {
    return announcements
      .filter(isUpcoming)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, now]);

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

        <div className="metric-card">

          <div className="metric-top">
            <div className="metric-icon">
              <UsersRound size={14} strokeWidth={2.2} />
            </div>

            Total Interview Candidates
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

            Interview Candidates Shown
          </div>

          <div className="metric-value-row">
            <div className="metric-value">
              {stats.shownOnBoard}
            </div>
          </div>

          <div className="metric-description">
            Currently being showed in the Visual
          </div>

        </div>

        <div className="metric-card">

          <div className="metric-top">
            <div className="metric-icon">
              <Images size={14} strokeWidth={2.2} />
            </div>

            Pictures Shown
          </div>

          <div className="metric-value-row">
            <div className="metric-value">
              {picturesShown}
            </div>
          </div>

          <div className="metric-description">
            Photos in frames on the Visual
          </div>

        </div>

        <div className="metric-card">

          <div className="metric-top">
            <div className="metric-icon">
              <UserPlus size={14} strokeWidth={2.2} />
            </div>

            New Interns
          </div>

          <div className="metric-value-row">
            <div className="metric-value">
              {stats.newInterns}
            </div>
          </div>

          <div className="metric-description">
            Added today
          </div>

        </div>

        <div className="metric-stack">

          <div className="metric-card">

            <div className="metric-top">
              <div className="metric-icon">
                <Megaphone size={14} strokeWidth={2.2} />
              </div>

              Announcements
            </div>

            <div className="metric-announcement">
              {currentAnnouncement?.message || 'No announcement posted'}
            </div>

            <div className="metric-description">
              {currentAnnouncement ? 'Currently on the visual board' : 'Nothing showing on the visual board'}
            </div>

            {boardLayout && !isVisible(boardLayout.announcements) && (
              <div className="visibility-alert">
                <AlertTriangle size={13} />
                <span>
                  The announcements panel is hidden on the visual board - nothing will show here
                  until it's turned back on in the{' '}
                  <Link to="/admin/visual-board">Visual Board editor</Link>.
                </span>
              </div>
            )}

          </div>

          <div className="metric-card upcoming-announcements">

            <div className="metric-top">
              <div className="metric-icon">
                <CalendarClock size={14} strokeWidth={2.2} />
              </div>

              Upcoming Announcements
            </div>

            {upcomingAnnouncements.length ? (
              <ul className="upcoming-announcements-list">
                {upcomingAnnouncements.map((announcement) => (
                  <li key={announcement.id} className="upcoming-announcement-item">
                    <div className="upcoming-announcement-message">{announcement.message}</div>
                    <div className="upcoming-announcement-time">
                      <CalendarClock size={11} />
                      {formatScheduledTime(new Date(announcement.scheduled_at), 'Asia/Manila')}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="upcoming-announcements-empty">Nothing scheduled</div>
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

            <div className="visual-preview-actions">
              <Link to="/admin/visual-board" className="visual-preview-link">
                <Pencil size={11} />
                Edit
              </Link>

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
          INTERVIEW SCHEDULE
      ========================================= */}

      <div className="metric-card metric-card--chart metric-card--schedule">

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

        {boardLayout && !isVisible(boardLayout.candidates) && (
          <div className="visibility-alert">
            <AlertTriangle size={13} />
            <span>
              The candidates panel is hidden on the visual board - each candidate's own Shown/Hidden
              toggle below won't take effect until it's turned back on in the{' '}
              <Link to="/admin/visual-board">Visual Board editor</Link>.
            </span>
          </div>
        )}

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
<CandidatePhoto
  className="candidate-avatar"
  url={candidate.photo_url}
  crop={candidate.photo_crop}
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

                          <div className="candidate-course">
                            {candidate.course || 'No course'}
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
                        aria-checked={isCandidateShownOnBoard(candidate)}
                        className={`visual-toggle ${
                          isCandidateShownOnBoard(candidate) ? 'on' : ''
                        }`}
                        onClick={() =>
                          toggleShowOnBoard(
                            candidate.id,
                            !isCandidateShownOnBoard(candidate)
                          )
                        }
                        aria-label={`${
                          isCandidateShownOnBoard(candidate) ? 'Hide' : 'Show'
                        } ${candidate.name} on the visual board`}
                      >
                        <span className="visual-toggle-track">
                          <span className="visual-toggle-thumb" />
                        </span>

                        <span className="visual-toggle-label">
                          {isCandidateShownOnBoard(candidate) ? 'Shown' : 'Hidden'}
                        </span>
                      </button>

                    </td>

                  </tr>

                ))}

                {!pagedCandidates.length && (

                  <tr>

                    <td colSpan={4}>

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
 * One series, so one hue and no legend - the panel title names it; today
 * is picked out by its bold date and TODAY label, not a colour of its own.
 * Every bar shows its count while there's room. Once many dates squeeze the
 * bars thin, only today's, the tallest (every one that ties) and the
 * hovered bar keep theirs, and the y gridlines carry the rest.
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

  // room for a count over every bar without the numbers running together
  const labelEveryBar = band >= 30;

  // keep x labels from colliding once the bands get narrow
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1;

  const summary = data
    .map((point) => `${formatLongDate(point.date)}: ${point.count}`)
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
            const labelled = labelEveryBar || isToday || point.count === peak || isHovered;

            return (
              <g key={point.date}>
                <path
                  d={roundedTopBarPath(x, y, barWidth, height, 4)}
                  className={`interview-chart-bar${isHovered ? ' is-hovered' : ''}`}
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
          <strong>{formatLongDate(active.date)}</strong>
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
