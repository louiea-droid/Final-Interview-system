'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  LayoutDashboard,
  UserRound,
  Users,
} from 'lucide-react';

import { supabase } from '../../../lib/supabase';

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  interview_type: string;
  interview_date: string | null;
  status: string;
};

const statusClasses: Record<string, string> = {
  Scheduled: 'candidate-status scheduled',
  Waiting: 'candidate-status waiting',
  'In Progress': 'candidate-status progress',
  Completed: 'candidate-status completed',
  Cancelled: 'candidate-status cancelled',
};

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function loadCandidates() {
      const { data, error } = await supabase
        .from('candidates')
        .select(
          'id, name, photo_url, position, interview_type, interview_date, status'
        )
        .order('interview_date', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setCandidates(data ?? []);
      }

      setLoading(false);
    }

    loadCandidates();
  }, []);

  const dates = useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((candidate) => candidate.interview_date)
          .filter((date): date is string => Boolean(date))
      )
    );
  }, [candidates]);

  const groupedCandidates = useMemo(() => {
    const filteredCandidates = candidates.filter(
      (candidate) =>
        selectedDate === 'all' || candidate.interview_date === selectedDate
    );
    const groups = new Map<string, Candidate[]>();

    filteredCandidates.forEach((candidate) => {
      const dateKey = candidate.interview_date ?? 'unscheduled';
      const group = groups.get(dateKey) ?? [];
      group.push(candidate);
      groups.set(dateKey, group);
    });

    return Array.from(groups.entries());
  }, [candidates, selectedDate]);

  const scheduledCount = candidates.filter(
    (candidate) => candidate.status !== 'Completed' && candidate.status !== 'Cancelled'
  ).length;

  return (
    <div className="admin-layout">
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
          <a className="sidebar-link" href="/admin">
            <LayoutDashboard size={14} />
            <span>Dashboard</span>
          </a>
          <div className="sidebar-link active">
            <Users size={14} />
            <span>Candidates</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">MANAGEMENT</div>
          <div className="sidebar-link">
            <span>Analytics</span>
          </div>
        </div>
      </aside>

      <main className="dashboard-content candidates-page">
        <header className="candidates-page-header">
          <div>
            <a className="back-link" href="/admin">
              <ArrowLeft size={13} />
              Dashboard
            </a>
            <h1 className="greeting-title">Candidates</h1>
            <p className="greeting-subtitle">
              The complete candidate list, organized by interview date.
            </p>
          </div>

          <div className="candidate-summary">
            <strong>{candidates.length}</strong>
            <span>Total candidates</span>
            <small>{scheduledCount} active</small>
          </div>
        </header>

        <section className="candidate-filter-bar">
          <div className="candidate-filter-title">
            <CalendarDays size={15} />
            <span>View candidates by date</span>
          </div>
          <select
            className="candidate-date-filter"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Filter candidates by interview date"
          >
            <option value="all">All dates</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {formatInterviewDate(date)}
              </option>
            ))}
          </select>
        </section>

        {errorMessage && <div className="message-box">{errorMessage}</div>}

        {loading ? (
          <div className="candidate-list-state">Loading candidates...</div>
        ) : groupedCandidates.length ? (
          <div className="candidate-date-groups">
            {groupedCandidates.map(([date, dateCandidates]) => (
              <section className="candidate-date-group" key={date}>
                <div className="candidate-date-heading">
                  <div>
                    <h2>
                      {date === 'unscheduled'
                        ? 'No date scheduled'
                        : formatInterviewDate(date)}
                    </h2>
                    <span>
                      {dateCandidates.length}{' '}
                      {dateCandidates.length === 1 ? 'candidate' : 'candidates'}
                    </span>
                  </div>
                </div>

                <div className="candidate-directory">
                  {dateCandidates.map((candidate) => (
                    <article className="candidate-directory-row" key={candidate.id}>
                      {candidate.photo_url ? (
                        <img
                          className="candidate-directory-avatar"
                          src={candidate.photo_url}
                          alt={candidate.name}
                        />
                      ) : (
                        <div className="candidate-directory-avatar no-photo-avatar">
                          <UserRound size={16} />
                        </div>
                      )}

                      <div className="candidate-directory-details">
                        <h3>{candidate.name}</h3>
                        <span>{candidate.position || 'No position'}</span>
                      </div>

                      <div className="candidate-directory-type">
                        {candidate.interview_type}
                      </div>

                      <span className={statusClasses[candidate.status] ?? 'candidate-status'}>
                        {candidate.status}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="candidate-list-state">
            No candidates found for this date.
          </div>
        )}
      </main>
    </div>
  );
}

function formatInterviewDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
