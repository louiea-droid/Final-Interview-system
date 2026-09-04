import { FormEvent, useEffect, useMemo, useState } from 'react';
import { removeBackground } from '@imgly/background-removal';
import {
  CalendarDays,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react';

// local stand-in for the backend; same query API, no network
import { localClient as supabase } from '../lib/localBackend';
import { isShownOnBoard } from '../lib/candidateVisibility';
import { getStatusPillClass } from '../lib/candidateStatus';
import CandidateDetailsModal from '../components/CandidateDetailsModal';
import PhotoCropModal from '../components/PhotoCropModal';
import DateField from '../components/DateField';
import { useToast } from '../components/ToastProvider';

function createEmptyAddForm() {
  return {
    localId: crypto.randomUUID(),
    name: '',
    photo_file: null,
    no_photo: false,
    position: '',
    interview_date: '',
  };
}

const statusClasses = {
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
  const [candidates, setCandidates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [loading, setLoading] = useState(true);
  const showToast = useToast();
  const [editingDate, setEditingDate] = useState(null);
  const [editForms, setEditForms] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForms, setAddForms] = useState([createEmptyAddForm()]);
  const [addProcessingIds, setAddProcessingIds] = useState(new Set());
  const [addCropTarget, setAddCropTarget] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cropTarget, setCropTarget] = useState
(null);

  async function loadCandidates() {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      showToast.error(error.message);
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
          .filter((date) => Boolean(date))
      )
    );
  }, [candidates]);

  const groupedCandidates = useMemo(() => {
    const filteredCandidates = candidates.filter(
      (candidate) =>
        selectedDate === 'all' ||
        getInterviewDateKey(candidate.interview_date) === selectedDate
    );
    const groups = new Map();

    filteredCandidates.forEach((candidate) => {
      const dateKey = getInterviewDateKey(candidate.interview_date);
      const group = groups.get(dateKey) ?? [];
      group.push(candidate);
      groups.set(dateKey, group);
    });

    return Array.from(groups.entries());
  }, [candidates, selectedDate]);

  function startEditing(date, dateCandidates) {
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

  async function saveEdit(event) {
    event?.preventDefault();
    if (!editingDate || !editForms.length || processingPhoto) return;

    setSavingEdit(true);

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
      showToast.error(failedResult.error.message);
    } else {
      const updatedCandidates = results
        .map((result) => result.data)
        .filter((candidate) => Boolean(candidate));
      setCandidates((current) =>
        current.map((candidate) =>
          updatedCandidates.find((updated) => updated.id === candidate.id) ?? candidate
        )
      );
      setEditingDate(null);
    }

    setSavingEdit(false);
  }

  function updateEditForm(id, field, value) {
    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, [field]: value } : candidate
      )
    );
  }

  async function handleEditPhotoChange(id, file) {
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

      setEditForms((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, photo_file: processedFile, no_photo: false }
            : candidate
        )
      );
    } catch {
      setEditForms((current) =>
        current.map((candidate) =>
          candidate.id === id
            ? { ...candidate, photo_file: file, no_photo: false }
            : candidate
        )
      );
      showToast.error('Background removal failed; using the original photo.');
    } finally {
      setProcessingPhoto(false);
    }
  }

  function openPhotoCrop(editForm) {
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

  function handleCroppedPhoto(file) {
    if (!cropTarget) return;

    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === cropTarget.candidateId
          ? { ...candidate, photo_file: file, no_photo: false }
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
    // Drop any pending inline edit for this candidate too, so a
    // stale id doesn't get sent along on the next Save Changes.
    setEditForms((current) =>
      current.filter((candidate) => candidate.id !== id)
    );
    setCandidateToDelete(null);
  }

  async function toggleGroupVisibility(
    groupCandidates,
    nextValue
  ) {
    const ids = groupCandidates.map((candidate) => candidate.id);

    const { error } = await supabase
      .from('candidates')
      .update({ show_in_visual: nextValue })
      .in('id', ids);

    if (error) {
      showToast.error(error.message);
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
    setAddForms([createEmptyAddForm()]);
    setAddModalOpen(true);
  }

  function closeAddModal() {
    setAddModalOpen(false);
    setAddForms([createEmptyAddForm()]);
    setAddCropTarget(null);
  }

  function addAnotherCandidate() {
    setAddForms((current) => [...current, createEmptyAddForm()]);
  }

  function removeAddCandidate(localId) {
    setAddForms((current) =>
      current.length > 1 ? current.filter((form) => form.localId !== localId) : current
    );
  }

  function updateAddForm(
    localId,
    field,
    value
  ) {
    setAddForms((current) =>
      current.map((form) => (form.localId === localId ? { ...form, [field]: value } : form))
    );
  }

  function setAddFormNoPhoto(localId, noPhoto) {
    setAddForms((current) =>
      current.map((form) =>
        form.localId === localId
          ? { ...form, no_photo: noPhoto, photo_file: noPhoto ? null : form.photo_file }
          : form
      )
    );
  }

  function openAddPhotoCrop(localId, imageSrc) {
    setAddCropTarget({ localId, imageSrc });
  }

  function handleAddCroppedPhoto(file) {
    if (!addCropTarget) return;
    const { localId } = addCropTarget;
    setAddForms((current) =>
      current.map((form) =>
        form.localId === localId ? { ...form, photo_file: file, no_photo: false } : form
      )
    );
  }

  // Background removal runs independently per card (tracked by localId)
  // instead of blocking the whole modal, so filling out — or submitting —
  // the other candidates doesn't have to wait on one slow photo.
  async function handleAddPhotoChange(localId, file) {
    if (!file) return;

    setAddProcessingIds((current) => new Set(current).add(localId));
    showToast.loading('Removing photo background...');

    try {
      const backgroundRemoved = await removeBackground(file);
      const processedFile = new File(
        [backgroundRemoved],
        `${file.name.replace(/\.[^.]+$/, '')}.png`,
        { type: 'image/png' }
      );

      setAddForms((current) =>
        current.map((form) =>
          form.localId === localId ? { ...form, photo_file: processedFile, no_photo: false } : form
        )
      );
    } catch {
      setAddForms((current) =>
        current.map((form) =>
          form.localId === localId ? { ...form, photo_file: file, no_photo: false } : form
        )
      );
      showToast.error('Background removal failed; using the original photo.');
    } finally {
      setAddProcessingIds((current) => {
        const next = new Set(current);
        next.delete(localId);
        return next;
      });
    }
  }

  async function addCandidates(event) {
    event.preventDefault();

    if (addProcessingIds.size > 0) return;

    const baseOrder = candidates.length
      ? Math.max(...candidates.map((candidate) => candidate.sort_order)) + 1
      : 1;

    // Upload every candidate's photo in parallel rather than one at a
    // time — with several candidates queued up, that's the difference
    // between waiting on N uploads back-to-back and waiting on one.
    const uploadResults = await Promise.all(
      addForms.map(async (form) => {
        if (form.no_photo || !form.photo_file) {
          return { photoUrl: null, error: null };
        }

        const file = form.photo_file;
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('Candidate-photos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) return { photoUrl: null, error: uploadError };

        const { data } = supabase.storage
          .from('Candidate-photos')
          .getPublicUrl(fileName);

        return { photoUrl: data.publicUrl, error: null };
      })
    );

    const failedUpload = uploadResults.find((result) => result.error);
    if (failedUpload?.error) {
      showToast.error(`Photo upload failed: ${failedUpload.error.message}`);
      return;
    }

    const { error } = await supabase.from('candidates').insert(
      addForms.map((form, index) => ({
        name: form.name,
        photo_url: uploadResults[index].photoUrl,
        position: form.position || null,
        interview_date: form.interview_date || null,
        status: 'Scheduled',
        interview_type: 'Final Interview',
        sort_order: baseOrder + index,
      }))
    );

    if (error) {
      showToast.error(error.message);
      return;
    }

    // The new candidates may not fall under whichever date is
    // currently filtered, so switch back to "All dates" to make
    // sure they're actually visible once the modal closes.
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
                        <UserRound size={28} />
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
                    <DateField
                      id={`record-date-${editForm.id}`}
                      value={editForm.interview_date}
                      onChange={(next) => updateEditForm(editForm.id, 'interview_date', next)}
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
            className="candidate-edit-popup group-edit-popup"
            onSubmit={addCandidates}
            aria-labelledby="records-add-candidate-title"
          >
            <div className="modal-heading-row">
              <div>
                <h2 id="records-add-candidate-title">Add candidates</h2>
                <p className="modal-subtitle">Fill out as many candidates as you need, then save them all at once.</p>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={closeAddModal}
                aria-label="Close add candidates modal"
              >
                &times;
              </button>
            </div>

            <div className="group-edit-fields">
              {addForms.map((form, index) => (
                <AddCandidateCard
                  key={form.localId}
                  form={form}
                  index={index}
                  canRemove={addForms.length > 1}
                  processing={addProcessingIds.has(form.localId)}
                  onChange={updateAddForm}
                  onRemove={removeAddCandidate}
                  onNoPhotoChange={setAddFormNoPhoto}
                  onPhotoChange={handleAddPhotoChange}
                  onOpenCrop={openAddPhotoCrop}
                />
              ))}
            </div>

            <button type="button" className="secondary-button" onClick={addAnotherCandidate}>
              <Plus size={12} />
              Add another candidate
            </button>

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
                disabled={addProcessingIds.size > 0}
              >
                {addProcessingIds.size > 0
                  ? 'Processing photos...'
                  : addForms.length > 1
                    ? `Add ${addForms.length} Candidates`
                    : 'Add Candidate'}
              </button>
            </div>
          </form>
        </div>
      )}

      {addCropTarget && (
        <PhotoCropModal
          imageSrc={addCropTarget.imageSrc}
          fileName="candidate-photo.png"
          onSave={handleAddCroppedPhoto}
          onClose={() => setAddCropTarget(null)}
        />
      )}

    </div>
  );
}

function AddCandidateCard({
  form,
  index,
  canRemove,
  processing,
  onChange,
  onRemove,
  onNoPhotoChange,
  onPhotoChange,
  onOpenCrop,
}) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!form.photo_file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(form.photo_file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [form.photo_file]);

  const photoInputId = `add-photo-${form.localId}`;

  return (
    <div className="record-edit-fieldset" role="group" aria-label={`Candidate ${index + 1}`}>
      <div className="record-edit-fieldset-header">
        <span className="record-edit-fieldset-name">Candidate {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            className="modal-close-button"
            onClick={() => onRemove(form.localId)}
            aria-label={`Remove candidate ${index + 1}`}
          >
            &times;
          </button>
        )}
      </div>

      <label className="form-label" htmlFor={photoInputId}>
        Candidate photo
      </label>
      <div className="photo-upload">
        {previewUrl && !form.no_photo && (
          <div className="record-edit-photo-preview">
            <button
              type="button"
              className="record-edit-photo-preview-button"
              onClick={() => onOpenCrop(form.localId, previewUrl)}
              aria-label="Preview and crop candidate photo"
            >
              <img src={previewUrl} alt="Candidate preview" />
            </button>
          </div>
        )}

        <label
          htmlFor={photoInputId}
          className={`photo-upload-box ${form.no_photo ? 'disabled' : ''}`}
        >
          <input
            id={photoInputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={form.no_photo}
            onChange={(event) => {
              void onPhotoChange(form.localId, event.target.files?.[0] ?? null);
            }}
          />
          <div className="photo-upload-content">
            <span className="photo-upload-title">
              {processing
                ? 'Processing...'
                : form.photo_file
                  ? form.photo_file.name
                  : 'Upload Photo'}
            </span>
            <span className="photo-upload-subtitle">PNG, JPG or WEBP</span>
          </div>
        </label>

        <label className="none-photo-option">
          <input
            type="checkbox"
            checked={form.no_photo}
            onChange={(event) => onNoPhotoChange(form.localId, event.target.checked)}
          />
          <span>None</span>
        </label>
      </div>

      <label className="form-label" htmlFor={`add-name-${form.localId}`}>
        Candidate name
      </label>
      <input
        id={`add-name-${form.localId}`}
        className="form-input"
        required
        placeholder="Enter candidate name"
        value={form.name}
        onChange={(event) => onChange(form.localId, 'name', event.target.value)}
      />

      <label className="form-label" htmlFor={`add-position-${form.localId}`}>
        Position
      </label>
      <input
        id={`add-position-${form.localId}`}
        className="form-input"
        placeholder="Position"
        value={form.position}
        onChange={(event) => onChange(form.localId, 'position', event.target.value)}
      />

      <label className="form-label" htmlFor={`add-date-${form.localId}`}>
        Interview date
      </label>
      <DateField
        id={`add-date-${form.localId}`}
        value={form.interview_date}
        onChange={(next) => onChange(form.localId, 'interview_date', next)}
      />
    </div>
  );
}

function formatInterviewDate(date) {
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate);
}

function formatInterviewGroup(date) {
  return date === 'unscheduled' ? 'Not scheduled' : formatInterviewDate(date);
}

function getInterviewDateKey(interviewDate) {
  return interviewDate || 'unscheduled';
}

function getAddedDateKey(createdAt) {
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
