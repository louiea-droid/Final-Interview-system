'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import {
  CalendarDays,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';

import { supabase } from '../../../../lib/supabase';
import { isShownOnBoard } from '../../../../lib/candidateVisibility';
import { getStatusPillClass } from '../../../../lib/candidateStatus';
import CandidateDetailsModal from '../../../../components/CandidateDetailsModal';
import PhotoCropModal from '../../../../components/PhotoCropModal';

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

const emptyAddForm = {
  name: '',
  photo_file: null as File | null,
  no_photo: false,
  position: '',
  interview_date: '',
};

type CandidateEdit = {
  id: string;
  name: string;
  position: string;
  interview_date: string;
  status: string;
  photo_file: File | null;
  no_photo: boolean;
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
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [viewingCandidate, setViewingCandidate] = useState<Candidate | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cropTarget, setCropTarget] = useState<{
    candidateId: string;
    imageSrc: string;
    isObjectUrl: boolean;
  } | null>(null);

  async function loadCandidates() {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setCandidates(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCandidates();
  }, []);

  const dates = useMemo(() => {
    return Array.from(
      new Set(
        candidates
          .map((candidate) => getInterviewDateKey(candidate.interview_date))
          .filter((date): date is string => Boolean(date))
      )
    );
  }, [candidates]);

  const groupedCandidates = useMemo(() => {
    const filteredCandidates = candidates.filter(
      (candidate) =>
        selectedDate === 'all' ||
        getInterviewDateKey(candidate.interview_date) === selectedDate
    );
    const groups = new Map<string, Candidate[]>();

    filteredCandidates.forEach((candidate) => {
      const dateKey = getInterviewDateKey(candidate.interview_date);
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
        photo_file: null,
        no_photo: !candidate.photo_url,
      }))
    );
  }

  async function saveEdit(event?: FormEvent) {
    event?.preventDefault();
    if (!editingDate || !editForms.length || processingPhoto) return;

    setSavingEdit(true);
    setErrorMessage('');

    const results = await Promise.all(editForms.map(async (candidate) => {
      const existingCandidate = candidates.find((item) => item.id === candidate.id);
      let photoUrl = candidate.no_photo ? null : existingCandidate?.photo_url ?? null;

      if (!candidate.no_photo && candidate.photo_file) {
        const fileExt = candidate.photo_file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('Candidate-photos')
          .upload(fileName, candidate.photo_file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) return { error: uploadError, data: null };

        photoUrl = supabase.storage
          .from('Candidate-photos')
          .getPublicUrl(fileName).data.publicUrl;
      }

      return supabase
        .from('candidates')
        .update({
          name: candidate.name,
          photo_url: photoUrl,
          position: candidate.position || null,
          interview_date: candidate.interview_date || null,
          status: candidate.status,
        })
        .eq('id', candidate.id)
        .select('*')
        .single();
    }));
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

  async function handleEditPhotoChange(id: string, file: File | null) {
    if (!file) return;

    setProcessingPhoto(true);
    setErrorMessage('Removing photo background...');

    try {
      const backgroundRemoved = await removeBackground(file);
      const processedFile = new File(
        [backgroundRemoved],
        `${file.name.replace(/\.[^.]+$/, '')}.png`,
        { type: 'image/png' }
      );

      setEditForms((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, photo_file: processedFile, no_photo: false }
            : candidate
        )
      );
      setErrorMessage('');
    } catch {
      setEditForms((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, photo_file: file, no_photo: false }
            : candidate
        )
      );
      setErrorMessage('Background removal failed; using the original photo.');
    } finally {
      setProcessingPhoto(false);
    }
  }

  function openPhotoCrop(editForm: CandidateEdit) {
    // Crop whichever photo is actually current for this candidate: a
    // newly-selected file takes priority over the one already saved.
    if (editForm.photo_file) {
      setCropTarget({
        candidateId: editForm.id,
        imageSrc: URL.createObjectURL(editForm.photo_file),
        isObjectUrl: true,
      });
      return;
    }

    const savedPhotoUrl = candidates.find((candidate) => candidate.id === editForm.id)?.photo_url;
    if (!savedPhotoUrl) return;

    setCropTarget({
      candidateId: editForm.id,
      imageSrc: savedPhotoUrl,
      isObjectUrl: false,
    });
  }

  function closePhotoCrop() {
    setCropTarget((current) => {
      if (current?.isObjectUrl) URL.revokeObjectURL(current.imageSrc);
      return null;
    });
  }

  function handleCroppedPhoto(file: File) {
    if (!cropTarget) return;

    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === cropTarget.candidateId
          ? { ...candidate, photo_file: file, no_photo: false }
          : candidate
      )
    );
  }

  async function removeCandidate(id: string) {
    setErrorMessage('');

    const { error } = await supabase
      .from('candidates')
      .delete()
      .eq('id', id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setCandidates((current) =>
      current.filter((candidate) => candidate.id !== id)
    );
    // Drop any pending inline edit for this candidate too, so a
    // stale id doesn't get sent along on the next Save Changes.
    setEditForms((current) =>
      current.filter((candidate) => candidate.id !== id)
    );
    setCandidateToDelete(null);
  }

  async function toggleGroupVisibility(
    groupCandidates: Candidate[],
    nextValue: boolean
  ) {
    setErrorMessage('');

    const ids = groupCandidates.map((candidate) => candidate.id);

    const { error } = await supabase
      .from('candidates')
      .update({ show_in_visual: nextValue })
      .in('id', ids);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setCandidates((current) =>
      current.map((candidate) =>
        ids.includes(candidate.id)
          ? { ...candidate, show_in_visual: nextValue }
          : candidate
      )
    );
  }

  function openAddModal() {
    setErrorMessage('');
    setAddForm(emptyAddForm);
    setAddModalOpen(true);
  }

  function closeAddModal() {
    setAddModalOpen(false);
    setAddForm(emptyAddForm);
    setErrorMessage('');
  }

  async function handleAddPhotoChange(file: File | null) {
    if (!file) return;

    setProcessingPhoto(true);
    setErrorMessage('Removing photo background...');

    try {
      const backgroundRemoved = await removeBackground(file);
      const processedFile = new File(
        [backgroundRemoved],
        `${file.name.replace(/\.[^.]+$/, '')}.png`,
        { type: 'image/png' }
      );

      setAddForm((current) => ({
        ...current,
        photo_file: processedFile,
        no_photo: false,
      }));
      setErrorMessage('');
    } catch {
      setAddForm((current) => ({
        ...current,
        photo_file: file,
        no_photo: false,
      }));
      setErrorMessage('Background removal failed; using the original photo.');
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function addCandidate(event: FormEvent) {
    event.preventDefault();

    if (processingPhoto) return;

    setErrorMessage('');

    const nextOrder = candidates.length
      ? Math.max(...candidates.map((candidate) => candidate.sort_order)) + 1
      : 1;

    let photoUrl: string | null = null;

    if (!addForm.no_photo && addForm.photo_file) {
      const file = addForm.photo_file;
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('Candidate-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(`Photo upload failed: ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage
        .from('Candidate-photos')
        .getPublicUrl(fileName);

      photoUrl = data.publicUrl;
    }

    const { error } = await supabase.from('candidates').insert({
      name: addForm.name,
      photo_url: photoUrl,
      position: addForm.position || null,
      interview_date: addForm.interview_date || null,
      status: 'Scheduled',
      interview_type: 'Final Interview',
      sort_order: nextOrder,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // The new candidate may not fall under whichever date is
    // currently filtered, so switch back to "All dates" to make
    // sure it's actually visible once the modal closes.
    setSelectedDate('all');
    closeAddModal();
    await loadCandidates();
  }

  return (
    <div className="candidates-page">
      <header className="candidates-page-header">
        <div>
          <h1 className="greeting-title">Records</h1>
          <p className="greeting-subtitle">
            Candidates organized by interview schedule.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={openAddModal}
        >
          <Plus size={12} />
          Add Candidate
        </button>
      </header>

      <section className="candidate-filter-bar">
        <div className="candidate-filter-title">
          <CalendarDays size={15} />
          <span>View candidates by interview date</span>
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
              {formatInterviewGroup(date)}
            </option>
          ))}
        </select>
      </section>

      {errorMessage && <div className="message-box">{errorMessage}</div>}

      {loading ? (
        <div className="candidate-list-state">Loading candidates...</div>
      ) : groupedCandidates.length ? (
        <div className="candidate-date-groups">
          {groupedCandidates.map(([date, dateCandidates]) => {
            const allShownOnBoard = dateCandidates.every((candidate) =>
              isShownOnBoard(candidate)
            );

            return (
            <section className="candidate-date-group" key={date}>
              <div className="candidate-date-heading">
                <div>
                  <h2>
                    {formatInterviewGroup(date)}
                  </h2>
                  <span>
                    {dateCandidates.length}{' '}
                    {dateCandidates.length === 1 ? 'candidate' : 'candidates'}
                  </span>
                </div>

                <div className="date-heading-actions">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allShownOnBoard}
                    className={`visual-toggle ${allShownOnBoard ? 'on' : ''}`}
                    onClick={() =>
                      toggleGroupVisibility(dateCandidates, !allShownOnBoard)
                    }
                    aria-label={`${
                      allShownOnBoard ? 'Hide' : 'Show'
                    } all candidates scheduled on ${formatInterviewGroup(date)} on the visual board`}
                  >
                    <span className="visual-toggle-track">
                      <span className="visual-toggle-thumb2" />
                    </span>
                    <span className="visual-toggle-label">
                      {allShownOnBoard ? 'Shown' : 'Hidden'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="edit-button date-edit-button"
                    onClick={() => startEditing(date, dateCandidates)}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                </div>
              </div>

              <div className="candidate-directory">
                {dateCandidates.map((candidate) => (
                  <article className="candidate-directory-row" key={candidate.id}>
                    <button
                      type="button"
                      className="candidate-directory-avatar-button"
                      onClick={() => setViewingCandidate(candidate)}
                      aria-label={`View ${candidate.name}'s details`}
                    >
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
                    </button>

                    <button
                      type="button"
                      className="candidate-directory-details"
                      onClick={() => setViewingCandidate(candidate)}
                      aria-label={`View ${candidate.name}'s details`}
                    >
                      <h3>{candidate.name}</h3>
                      <span>{candidate.position || 'No position'}</span>
                    </button>

                    <div className="candidate-directory-type">
                      <small>Date added</small>
                      <strong>
                        {formatInterviewDate(getAddedDateKey(candidate.created_at))}
                      </strong>
                    </div>

                    <span className={statusClasses[candidate.status] ?? 'candidate-status'}>
                      {candidate.status}
                    </span>

                    <div className="candidate-directory-edit">
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => setCandidateToDelete(candidate)}
                        aria-label={`Remove ${candidate.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                  </article>
                ))}
              </div>

            </section>
            );
          })}
        </div>
      ) : (
        <div className="candidate-list-state">
          No candidates found for this date.
        </div>
      )}

      {editingDate && (
        <div className="confirmation-overlay" role="presentation">
          <form
            className="candidate-edit-popup group-edit-popup"
            onSubmit={saveEdit}
            aria-labelledby="records-edit-candidates-title"
          >
            <div className="modal-heading-row">
              <div>
                <h2 id="records-edit-candidates-title">Edit candidates</h2>
                <p className="modal-subtitle">Update the selected interview group.</p>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setEditingDate(null)}
                aria-label="Close edit candidates modal"
              >
                &times;
              </button>
            </div>

            <div className="group-edit-fields">
              {editForms.map((editForm) => (
                <div
                  className="record-edit-fieldset"
                  role="group"
                  aria-label={`Edit ${candidates.find((candidate) => candidate.id === editForm.id)?.name ?? 'candidate'}`}
                  key={editForm.id}
                >
                  <div className="record-edit-fieldset-header">
                    <span className="record-edit-fieldset-name">
                      {candidates.find((candidate) => candidate.id === editForm.id)?.name ?? 'Candidate'}
                    </span>
                    <span className={getStatusPillClass(editForm.status)}>{editForm.status}</span>
                  </div>

                  <div className="record-edit-photo">
                    <div className="record-edit-photo-preview">
                      {candidates.find((candidate) => candidate.id === editForm.id)?.photo_url && !editForm.no_photo ? (
                        <button
                          type="button"
                          className="record-edit-photo-preview-button"
                          onClick={() => openPhotoCrop(editForm)}
                          aria-label="Preview and crop candidate photo"
                        >
                          <img
                            src={candidates.find((candidate) => candidate.id === editForm.id)?.photo_url ?? ''}
                            alt="Current candidate"
                          />
                        </button>
                      ) : (
                        <UserRound size={18} />
                      )}
                    </div>
                    <div className="record-edit-photo-controls">
                      <label className="form-label" htmlFor={`record-photo-${editForm.id}`}>
                        Candidate photo
                      </label>
                      <input
                        id={`record-photo-${editForm.id}`}
                        className="record-edit-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={editForm.no_photo || processingPhoto}
                        onChange={(event) =>
                          void handleEditPhotoChange(editForm.id, event.target.files?.[0] ?? null)
                        }
                      />
                      {editForm.photo_file && (
                        <small className="record-edit-file-name">New photo selected</small>
                      )}
                      <label className="record-edit-remove-photo">
                        <input
                          type="checkbox"
                          checked={editForm.no_photo}
                          onChange={(event) =>
                            setEditForms((current) =>
                              current.map((candidate) =>
                                candidate.id === editForm.id
                                  ? { ...candidate, no_photo: event.target.checked, photo_file: null }
                                  : candidate
                              )
                            )
                          }
                        />
                        Remove photo
                      </label>
                    </div>
                  </div>

                  <div className="record-edit-field">
                    <label className="form-label" htmlFor={`record-name-${editForm.id}`}>
                      Candidate name
                    </label>
                    <input
                      id={`record-name-${editForm.id}`}
                      className="form-input"
                      required
                      value={editForm.name}
                      onChange={(event) => updateEditForm(editForm.id, 'name', event.target.value)}
                    />
                  </div>

                  <div className="record-edit-field-row">
                    <div className="record-edit-field">
                      <label className="form-label" htmlFor={`record-position-${editForm.id}`}>
                        Position
                      </label>
                      <input
                        id={`record-position-${editForm.id}`}
                        className="form-input"
                        value={editForm.position}
                        onChange={(event) => updateEditForm(editForm.id, 'position', event.target.value)}
                      />
                    </div>

                    <div className="record-edit-field">
                      <label className="form-label" htmlFor={`record-status-${editForm.id}`}>
                        Status
                      </label>
                      <select
                        id={`record-status-${editForm.id}`}
                        className="form-select"
                        value={editForm.status}
                        onChange={(event) => updateEditForm(editForm.id, 'status', event.target.value)}
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="record-edit-field">
                    <label className="form-label" htmlFor={`record-date-${editForm.id}`}>
                      Interview schedule
                    </label>
                    <input
                      id={`record-date-${editForm.id}`}
                      className="form-input"
                      type="date"
                      value={editForm.interview_date}
                      onChange={(event) => updateEditForm(editForm.id, 'interview_date', event.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingDate(null)}
              >
                Cancel
              </button>
              <button type="submit" className="confirm-delete-button" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
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
            aria-labelledby="records-delete-confirmation-title"
          >
            <h2 id="records-delete-confirmation-title">
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

      {cropTarget && (
        <PhotoCropModal
          imageSrc={cropTarget.imageSrc}
          fileName={`candidate-${cropTarget.candidateId}.png`}
          onSave={handleCroppedPhoto}
          onClose={closePhotoCrop}
        />
      )}

      {addModalOpen && (
        <div className="confirmation-overlay">
          <form
            className="candidate-edit-popup"
            onSubmit={addCandidate}
            aria-labelledby="records-add-candidate-title"
          >
            <h2 id="records-add-candidate-title">Add Candidate</h2>

            <label className="form-label" htmlFor="records-add-photo">
              Candidate Photo
            </label>
            <div className="photo-upload">
              <label
                htmlFor="records-add-photo"
                className={`photo-upload-box ${addForm.no_photo ? 'disabled' : ''}`}
              >
                <input
                  id="records-add-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={addForm.no_photo}
                  onChange={(event) => {
                    void handleAddPhotoChange(event.target.files?.[0] ?? null);
                  }}
                />
                <div className="photo-upload-content">
                  <span className="photo-upload-title">
                    {addForm.photo_file ? addForm.photo_file.name : 'Upload Photo'}
                  </span>
                  <span className="photo-upload-subtitle">PNG, JPG or WEBP</span>
                </div>
              </label>

              <label className="none-photo-option">
                <input
                  type="checkbox"
                  checked={addForm.no_photo}
                  onChange={(event) =>
                    setAddForm((current) => ({
                      ...current,
                      no_photo: event.target.checked,
                      photo_file: event.target.checked ? null : current.photo_file,
                    }))
                  }
                />
                <span>None</span>
              </label>
            </div>

            <label className="form-label" htmlFor="records-add-name">
              Candidate Name
            </label>
            <input
              id="records-add-name"
              className="form-input"
              required
              placeholder="Enter candidate name"
              value={addForm.name}
              onChange={(event) =>
                setAddForm((current) => ({ ...current, name: event.target.value }))
              }
            />

            <label className="form-label" htmlFor="records-add-position">
              Position
            </label>
            <input
              id="records-add-position"
              className="form-input"
              placeholder="Position"
              value={addForm.position}
              onChange={(event) =>
                setAddForm((current) => ({ ...current, position: event.target.value }))
              }
            />

            <label className="form-label" htmlFor="records-add-date">
              Interview Date
            </label>
            <input
              id="records-add-date"
              className="form-input"
              type="date"
              value={addForm.interview_date}
              onChange={(event) =>
                setAddForm((current) => ({ ...current, interview_date: event.target.value }))
              }
            />

            {errorMessage && <div className="message-box">{errorMessage}</div>}

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAddModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="confirm-delete-button"
                disabled={processingPhoto}
              >
                {processingPhoto ? 'Processing Photo...' : 'Add Candidate'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

function formatInterviewDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate);
}

function formatInterviewGroup(date: string) {
  return date === 'unscheduled' ? 'Not scheduled' : formatInterviewDate(date);
}

function getInterviewDateKey(interviewDate: string | null) {
  return interviewDate || 'unscheduled';
}

function getAddedDateKey(createdAt: string) {
  const parsedDate = new Date(createdAt);

  if (Number.isNaN(parsedDate.getTime())) return 'unknown';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsedDate);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}
