'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Pencil,
  UserRound,
} from 'lucide-react';

import { supabase } from '../../../../lib/supabase';

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  interview_type: string;
  interview_date: string | null;
  status: string;
  created_at: string;
};

type CandidateEdit = {
  id: string;
  name: string;
  position: string;
  interview_date: string;
  status: string;
};

const statusClasses: Record<string, string> = {
  Scheduled: 'candidate-status scheduled',
  Waiting: 'candidate-status waiting',
  'In Progress': 'candidate-status progress',
  Completed: 'candidate-status completed',
  Cancelled: 'candidate-status cancelled',
};

const statuses = [
  'Scheduled',
  'Waiting',
  'In Progress',
  'Completed',
  'Cancelled',
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<CandidateEdit[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    async function loadCandidates() {
      const { data, error } = await supabase
        .from('candidates')
        .select(
          'id, name, photo_url, position, interview_type, interview_date, status, created_at'
        )
        .order('created_at', { ascending: false })
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
          .map((candidate) => getAddedDateKey(candidate.created_at))
          .filter((date): date is string => Boolean(date))
      )
    );
  }, [candidates]);

  const groupedCandidates = useMemo(() => {
    const filteredCandidates = candidates.filter(
      (candidate) =>
        selectedDate === 'all' ||
        getAddedDateKey(candidate.created_at) === selectedDate
    );
    const groups = new Map<string, Candidate[]>();

    filteredCandidates.forEach((candidate) => {
      const dateKey = getAddedDateKey(candidate.created_at);
      const group = groups.get(dateKey) ?? [];
      group.push(candidate);
      groups.set(dateKey, group);
    });

    return Array.from(groups.entries());
  }, [candidates, selectedDate]);

  function startEditing(date: string, dateCandidates: Candidate[]) {
    setEditingDate(date);
    setEditForms(
      dateCandidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        position: candidate.position ?? '',
        interview_date: candidate.interview_date ?? '',
        status: candidate.status,
      }))
    );
  }

  async function saveEdit(event?: FormEvent) {
    event?.preventDefault();
    if (!editingDate || !editForms.length) return;

    setSavingEdit(true);
    setErrorMessage('');

    const results = await Promise.all(
      editForms.map((candidate) =>
        supabase
          .from('candidates')
          .update({
            name: candidate.name,
            position: candidate.position || null,
            interview_date: candidate.interview_date || null,
            status: candidate.status,
          })
          .eq('id', candidate.id)
          .select(
            'id, name, photo_url, position, interview_type, interview_date, status, created_at'
          )
          .single()
      )
    );
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      setErrorMessage(failedResult.error.message);
    } else {
      const updatedCandidates = results
        .map((result) => result.data)
        .filter((candidate): candidate is Candidate => Boolean(candidate));
      setCandidates((current) =>
        current.map((candidate) =>
          updatedCandidates.find((updated) => updated.id === candidate.id) ?? candidate
        )
      );
      setEditingDate(null);
    }

    setSavingEdit(false);
  }

  function updateEditForm(id: string, field: keyof CandidateEdit, value: string) {
    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, [field]: value } : candidate
      )
    );
  }

  return (
    <div className="candidates-page">
      <header className="candidates-page-header">
        <div>
          <h1 className="greeting-title">History</h1>
          <p className="greeting-subtitle">
            The complete candidate history, organized by date added.
          </p>
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
          aria-label="Filter candidates by date added"
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
                    {formatInterviewDate(date)}
                  </h2>
                  <span>
                    {dateCandidates.length}{' '}
                    {dateCandidates.length === 1 ? 'candidate' : 'candidates'}
                  </span>
                </div>
                {editingDate === date ? (
                  <div className="date-edit-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditingDate(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-delete-button"
                      onClick={() => saveEdit()}
                      disabled={savingEdit}
                    >
                      {savingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="edit-button date-edit-button"
                    onClick={() => startEditing(date, dateCandidates)}
                  >
                    <Pencil size={12} />
                    Edit candidates
                  </button>
                )}
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

                    {editingDate === date ? (
                      <div className="direct-edit-details">
                        <input
                          className="form-input"
                          aria-label="Candidate Name"
                          required
                          value={editForms.find((item) => item.id === candidate.id)?.name ?? ''}
                          onChange={(event) =>
                            updateEditForm(candidate.id, 'name', event.target.value)
                          }
                        />
                        <input
                          className="form-input"
                          aria-label="Position"
                          value={editForms.find((item) => item.id === candidate.id)?.position ?? ''}
                          onChange={(event) =>
                            updateEditForm(candidate.id, 'position', event.target.value)
                          }
                        />
                      </div>
                    ) : (
                      <div className="candidate-directory-details">
                        <h3>{candidate.name}</h3>
                        <span>{candidate.position || 'No position'}</span>
                      </div>
                    )}

                    {editingDate === date ? (
                      <input
                        className="form-input direct-edit-date"
                        type="date"
                        aria-label="Interview Schedule"
                        value={editForms.find((item) => item.id === candidate.id)?.interview_date ?? ''}
                        onChange={(event) =>
                          updateEditForm(candidate.id, 'interview_date', event.target.value)
                        }
                      />
                    ) : (
                      <div className="candidate-directory-type">
                        <small>Interview schedule</small>
                        <strong>
                          {candidate.interview_date
                            ? formatInterviewDate(candidate.interview_date)
                            : 'Not scheduled'}
                        </strong>
                      </div>
                    )}

                    {editingDate === date ? (
                      <select
                        className="form-select direct-edit-status"
                        aria-label="Status"
                        value={editForms.find((item) => item.id === candidate.id)?.status ?? ''}
                        onChange={(event) =>
                          updateEditForm(candidate.id, 'status', event.target.value)
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={statusClasses[candidate.status] ?? 'candidate-status'}>
                        {candidate.status}
                      </span>
                    )}

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

    </div>
  );
}

function formatInterviewDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function getAddedDateKey(createdAt: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(createdAt));
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}
