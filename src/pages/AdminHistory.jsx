import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';

// local stand-in for the backend; same query API, no network
import { firebaseClient } from '../lib/firebaseBackend';
import { isShownOnBoard } from '../lib/candidateVisibility';
import { bySortOrder, reorderGroup } from '../lib/candidateOrder';
import { getStatusPillClass } from '../lib/candidateStatus';
import CandidateDetailsModal from '../components/CandidateDetailsModal';
import CandidatePhoto from '../components/CandidatePhoto';
import { pickImageFile } from '../lib/imageFiles';
import { applyReviewResult, attachPhoto, canSave, changeCrop, changeEdits, needsReview, reviewCount } from '../lib/photoReview';
import PhotoReviewDialog from '../components/PhotoReviewDialog';
import { photoQueue } from '../lib/backgroundRemover';
import TablePagination from '../components/TablePagination';
import PhotoCropModal from '../components/PhotoCropModal';
import DateField from '../components/DateField';
import CapsFixInput from '../components/CapsFixInput';
import { useToast } from '../components/ToastProvider';

function createEmptyAddForm() {
  return {
    localId: crypto.randomUUID(),
    name: '',
    photo_file: null,
    photo_crop: null,
    no_photo: false,
    course: '',
    interview_date: '',
  };
}

const statuses = [
  'Scheduled',
  'Completed',
  'Cancelled',
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const showToast = useToast();
  const [editingDate, setEditingDate] = useState(null);
  const [editForms, setEditForms] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForms, setAddForms] = useState([createEmptyAddForm()]);
  /* which form's photo review is open: 'add' | 'edit' | null */
  const [reviewOpen, setReviewOpen] = useState(null);
  /* the photo and tab the editor opens on, when opened from a card's preview */
  const [reviewStart, setReviewStart] = useState(null);
  const [isAddingCandidates, setIsAddingCandidates] = useState(false);
  const [cropTarget, setCropTarget] = useState
(null);

  async function loadCandidates() {
    const { data, error } = await firebaseClient
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
    ).sort(compareDateKeys);
  }, [candidates]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredCandidates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return candidates.filter((candidate) => {
      const matchesDate =
        selectedDate === 'all' ||
        getInterviewDateKey(candidate.interview_date) === selectedDate;
      const matchesSearch = !term || candidate.name.toLowerCase().includes(term);

      return matchesDate && matchesSearch;
    }).sort(
      (a, b) =>
        compareDateKeys(getInterviewDateKey(a.interview_date), getInterviewDateKey(b.interview_date)) ||
        bySortOrder(a, b)
    );
  }, [candidates, selectedDate, searchTerm]);

  /*
   * Drag-to-reorder inside one date's group. The new order is the board's
   * order (sort_order), so /visual follows it live. Dropping on another date
   * does nothing - Edit is how a candidate changes date.
   */
  const [draggingId, setDraggingId] = useState(null);

  async function moveCandidate(dateCandidates, draggedId, targetId) {
    const { changes } = reorderGroup(dateCandidates, draggedId, targetId);
    if (!changes.length) return;

    const next = new Map(changes.map((change) => [change.id, change.sort_order]));
    setCandidates((current) =>
      current.map((candidate) =>
        next.has(candidate.id) ? { ...candidate, sort_order: next.get(candidate.id) } : candidate
      )
    );

    const results = await Promise.all(
      changes.map(({ id, sort_order }) =>
        firebaseClient.from('candidates').update({ sort_order }).eq('id', id)
      )
    );
    const failed = results.find((result) => result.error);
    if (failed) {
      showToast.error(`Unable to save the new order: ${failed.error.message}`);
      loadCandidates();
    }
  }

  const pageCandidates = useMemo(
    () => filteredCandidates.slice((page - 1) * pageSize, page * pageSize),
    [filteredCandidates, page, pageSize]
  );

  /*
   * Grouping is applied to the page rather than the whole list, so a page
   * always holds exactly `pageSize` candidates while still being broken up
   * by interview date. A date spanning a page boundary simply appears as a
   * heading on both pages.
   */
  const groupedCandidates = useMemo(() => {
    const groups = new Map();

    pageCandidates.forEach((candidate) => {
      const dateKey = getInterviewDateKey(candidate.interview_date);
      const group = groups.get(dateKey) ?? [];
      group.push(candidate);
      groups.set(dateKey, group);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => compareDateKeys(a, b));
  }, [pageCandidates]);

  // a shrinking list must not leave the view stranded past the end
  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
    if (page > pageCount) setPage(pageCount);
  }, [filteredCandidates.length, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedDate]);

  // leaving Records drops its removals, so ~10 s jobs don't run on for forms that are gone
  useEffect(() => () => photoQueue.cancelAll(), []);

  function startEditing(date, dateCandidates) {
    setEditingDate(date);
    setEditForms(
      dateCandidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        course: candidate.course ?? '',
        interview_date: candidate.interview_date ?? '',
        status: candidate.status,
        photo_file: null,
        photo_crop: candidate.photo_crop ?? null,
        no_photo: !candidate.photo_url,
      }))
    );
  }

  async function saveEdit(event) {
    event?.preventDefault();
    if (!editingDate || !editForms.length || !canSave(editForms)) return;

    setSavingEdit(true);

    try {
      const results = await Promise.all(editForms.map(async (candidate) => {
        const existingCandidate = candidates.find((item) => item.id === candidate.id);
        let photoUrl = candidate.no_photo ? null : existingCandidate?.photo_url ?? null;

        if (!candidate.no_photo && candidate.photo_file) {
          const fileExt = candidate.photo_file.name.split('.').pop();
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          const { error: uploadError } = await firebaseClient.storage
            .from('Candidate-photos')
            .upload(fileName, candidate.photo_file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) return { error: uploadError, data: null };

          photoUrl = firebaseClient.storage
            .from('Candidate-photos')
            .getPublicUrl(fileName).data.publicUrl;
        }

        return firebaseClient
          .from('candidates')
          .update({
            name: candidate.name,
            photo_url: photoUrl,
            photo_crop: photoUrl ? candidate.photo_crop : null,
            course: candidate.course || null,
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
    } catch (error) {
      showToast.error(error.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function updateEditForm(id, field, value) {
    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, [field]: value } : candidate
      )
    );
  }

  /* A replacement photo attaches straight away; it's reviewed before Save. */
  function handleEditPhotoChange(id, file) {
    if (!file) return;
    photoQueue.cancel(`edit:${id}`);
    setEditForms((current) => current.map((candidate) => (candidate.id === id ? attachPhoto(candidate, file) : candidate)));
  }

  function openEditReview(key, tab) {
    setReviewStart(key ? { key, tab } : null);
    setReviewOpen('edit');
    runRemovals('edit', editForms, setEditForms, (candidate) => candidate.id);
  }

  /* Leaving the Edit form drops any removal still queued for it. */
  function closeEditModal() {
    for (const candidate of editForms) photoQueue.cancel(`edit:${candidate.id}`);
    setReviewOpen((current) => (current === 'edit' ? null : current));
    setEditingDate(null);
  }

  function openPhotoCrop(editForm) {
    // a newly chosen photo is cleaned, cropped and adjusted in the photo editor
    if (editForm.photo_original) {
      openEditReview(editForm.id, needsReview(editForm) ? 'cleanup' : 'crop');
      return;
    }

    const savedPhotoUrl = candidates.find((candidate) => candidate.id === editForm.id)?.photo_url;
    if (!savedPhotoUrl) return;

    setCropTarget({
      candidateId: editForm.id,
      imageSrc: savedPhotoUrl,
      initialCrop: editForm.photo_crop,
      isObjectUrl: false,
    });
  }

  function closePhotoCrop() {
    setCropTarget((current) => {
      if (current?.isObjectUrl) URL.revokeObjectURL(current.imageSrc);
      return null;
    });
  }

  function handleCroppedPhoto(crop) {
    if (!cropTarget) return;

    setEditForms((current) =>
      current.map((candidate) =>
        candidate.id === cropTarget.candidateId
          ? { ...candidate, photo_crop: crop, no_photo: false }
          : candidate
      )
    );
  }

  async function removeCandidate(id) {
    const { error } = await firebaseClient
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

    const { error } = await firebaseClient
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
    for (const form of addForms) photoQueue.cancel(`add:${form.localId}`);
    setReviewOpen((current) => (current === 'add' ? null : current));
    setAddModalOpen(false);
    setAddForms([createEmptyAddForm()]);
  }

  function addAnotherCandidate() {
    setAddForms((current) => [...current, createEmptyAddForm()]);
  }

  function removeAddCandidate(localId) {
    if (addForms.length > 1) photoQueue.cancel(`add:${localId}`);
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
    if (noPhoto) photoQueue.cancel(`add:${localId}`);
    setAddForms((current) =>
      current.map((form) =>
        form.localId === localId
          ? {
              ...form,
              no_photo: noPhoto,
              photo_file: noPhoto ? null : form.photo_file,
              photo_crop: noPhoto ? null : form.photo_crop,
              // None drops the attached photo, and its pending review with it
              ...(noPhoto ? { photo_original: null, photo_status: null, photo_cutout: null } : {}),
            }
          : form
      )
    );
  }

  /* A chosen or dropped photo just attaches - its background is removed in the review. */
  function handleAddPhotoChange(localId, file) {
    if (!file) return;
    photoQueue.cancel(`add:${localId}`);
    setAddForms((current) => current.map((form) => (form.localId === localId ? attachPhoto(form, file) : form)));
  }

  /*
   * Starts background removal, off the main thread and one at a time, for
   * every photo that hasn't been processed yet. Results are written back by
   * key, and only if the card still holds the same photo - so a candidate
   * removed, or a photo replaced, mid-removal never gets a stale cut-out.
   */
  function runRemovals(kind, entries, setEntries, keyOf) {
    for (const entry of entries) {
      if (!entry.photo_original || entry.no_photo) continue;
      if (entry.photo_status !== 'pending' && entry.photo_status !== 'failed') continue;

      const key = keyOf(entry);
      const file = entry.photo_original;
      const update = (patch) =>
        setEntries((current) =>
          current.map((item) => (keyOf(item) === key && item.photo_original === file ? { ...item, ...patch(item) } : item))
        );
      // only a photo still waiting on its removal changes status; one already finished
      // (e.g. with Keep original) keeps it, and just gains the cut-out
      const settle = (status) => (item) => (item.photo_status === 'processing' ? { photo_status: status } : {});

      update(() => ({ photo_status: 'processing' }));
      photoQueue.enqueue(`${kind}:${key}`, file).then(
        (blob) => update((item) => ({ photo_cutout: blob, ...settle('ready')(item) })),
        (error) => {
          if (error?.name !== 'CancelledError') update(settle('failed'));
        }
      );
    }
  }

  function openAddReview(key, tab) {
    setReviewStart(key ? { key, tab } : null);
    setReviewOpen('add');
    runRemovals('add', addForms, setAddForms, (form) => form.localId);
  }

  /*
   * The review dialog's wiring for one form: its photos, where edits are
   * kept (on the form entries, so they survive closing the dialog), and
   * how Done writes the finished photos back.
   */
  function reviewProps(kind, entries, setEntries, keyOf, labelOf) {
    const items = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.photo_original && !entry.no_photo)
      .map(({ entry, index }) => ({ key: keyOf(entry), label: labelOf(entry, index), entry }));

    return {
      items,
      onEditsChange: (key, edits) =>
        setEntries((current) => current.map((entry) => (keyOf(entry) === key ? changeEdits(entry, edits) : entry))),
      onCropChange: (key, crop) =>
        setEntries((current) => current.map((entry) => (keyOf(entry) === key ? changeCrop(entry, crop) : entry))),
      startKey: reviewStart?.key,
      startTab: reviewStart?.tab,
      onRetry: (key) => {
        const entry = entries.find((item) => keyOf(item) === key);
        if (entry) runRemovals(kind, [{ ...entry, photo_status: 'pending' }], setEntries, keyOf);
      },
      onDone: (results) => {
        const byKey = new Map(results.map((result) => [result.key, result]));
        // each result lands only on the photo, edits and crop it was made from
        setEntries((current) =>
          current.map((entry) => (byKey.has(keyOf(entry)) ? applyReviewResult(entry, byKey.get(keyOf(entry))) : entry))
        );
        setReviewOpen(null);
      },
      onClose: () => setReviewOpen(null),
    };
  }

  async function addCandidates(event) {
    event.preventDefault();

    if (!canSave(addForms) || isAddingCandidates) return;

    setIsAddingCandidates(true);
    const loadingToastId = showToast.loading(
      addForms.length > 1 ? 'Adding candidates...' : 'Adding candidate...',
      { duration: Infinity }
    );

    try {
      const baseOrder = candidates.length
        ? Math.max(...candidates.map((candidate) => Number(candidate.sort_order) || 0)) + 1
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

          const { error: uploadError } = await firebaseClient.storage
            .from('Candidate-photos')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) return { photoUrl: null, error: uploadError };

          const { data } = firebaseClient.storage
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

      const { error } = await firebaseClient.from('candidates').insert(
        addForms.map((form, index) => ({
          name: form.name,
          photo_url: uploadResults[index].photoUrl,
          photo_crop: uploadResults[index].photoUrl ? form.photo_crop : null,
          course: form.course || null,
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
      showToast.success(
        addForms.length > 1 ? `${addForms.length} candidates added.` : 'Candidate added.'
      );
    } finally {
      showToast.dismiss(loadingToastId);
      setIsAddingCandidates(false);
    }
  }

  return (
    <>
      <div className="candidates-page">
        <header className="candidates-page-header">
          <div>
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

          <div className="table-search">
            <Search size={13} />
            <input
              type="search"
              className="table-search-input"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search candidates by name"
            />
          </div>
        </section>

        {loading ? (
          <div
            className="candidate-list-state"
            style={{ '--rows-per-page': pageSize }}
          >Loading candidates...</div>
        ) : groupedCandidates.length ? (
          <div
            className="candidate-date-groups"
            style={{
              '--rows-per-page': pageSize,
              '--group-count': groupedCandidates.length,
            }}
          >
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
                    <article
                      className={`candidate-directory-row${draggingId === candidate.id ? ' dragging-row' : ''}`}
                      key={candidate.id}
                      draggable
                      onDragStart={() => setDraggingId(candidate.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDragOver={(event) => {
                        // only a row of the same date is a drop target
                        if (dateCandidates.some((item) => item.id === draggingId)) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingId) void moveCandidate(dateCandidates, draggingId, candidate.id);
                        setDraggingId(null);
                      }}
                    >
                      <span className="candidate-drag-handle" title="Drag to reorder" aria-hidden="true">
                        <GripVertical size={14} />
                      </span>

                      <button
                        type="button"
                        className="candidate-directory-avatar-button"
                        onClick={() => setViewingCandidate(candidate)}
                        aria-label={`View ${candidate.name}'s details`}
                      >
                        {candidate.photo_url ? (
                          <CandidatePhoto
                            className="candidate-directory-avatar"
                            url={candidate.photo_url}
                            crop={candidate.photo_crop}
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
                        <span>{candidate.course || 'No course'}</span>
                      </button>

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
          <div
            className="candidate-list-state"
            style={{ '--rows-per-page': pageSize }}
          >
            {searchTerm.trim() ? 'No candidates match your search.' : 'No candidates found for this date.'}
          </div>
        )}

        {!loading && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={filteredCandidates.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {/*
       * The modals below are deliberately siblings of .candidates-page, not
       * descendants - that div fades in via a CSS animation, which creates a
       * stacking context and would otherwise trap these position: fixed
       * overlays under the sticky header regardless of their own z-index.
       */}

      {editingDate && (
        <div className="confirmation-overlay" role="presentation">
          {/* a photo dropped just beside a photo box would otherwise open in the tab and lose the form */}
          <form
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
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
                onClick={closeEditModal}
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
                      {(editForm.photo_file || candidates.find((candidate) => candidate.id === editForm.id)?.photo_url) &&
                      !editForm.no_photo ? (
                        <button
                          type="button"
                          className="record-edit-photo-preview-button"
                          onClick={() => openPhotoCrop(editForm)}
                          aria-label={editForm.photo_original ? 'Open the photo editor' : 'Preview and crop candidate photo'}
                        >
                          {editForm.photo_file ? (
                            <LocalPhotoPreview file={editForm.photo_file} crop={needsReview(editForm) ? null : editForm.photo_crop} alt="New candidate photo" />
                          ) : (
                            <CandidatePhoto
                              url={candidates.find((candidate) => candidate.id === editForm.id)?.photo_url ?? ''}
                              crop={editForm.photo_crop}
                              alt="Current candidate"
                            />
                          )}
                        </button>
                      ) : (
                        <UserRound size={28} />
                      )}
                    </div>
                    <div className="record-edit-photo-controls">
                      <div className="photo-label-row">
                        <label className="form-label" htmlFor={`record-photo-${editForm.id}`}>
                          Candidate photo
                        </label>
                        <ReviewChip entry={editForm} />
                      </div>
                      <PhotoDropBox
                        inputId={`record-photo-${editForm.id}`}
                        disabled={editForm.no_photo}
                        fileName={editForm.photo_original?.name}
                        onFile={(file) => handleEditPhotoChange(editForm.id, file)}
                      />
                      <label className="record-edit-remove-photo">
                        <input
                          type="checkbox"
                          checked={editForm.no_photo}
                          onChange={(event) => {
                            if (event.target.checked) photoQueue.cancel(`edit:${editForm.id}`);
                            setEditForms((current) =>
                              current.map((candidate) =>
                                candidate.id === editForm.id
                                  ? {
                                      ...candidate,
                                      no_photo: event.target.checked,
                                      photo_file: null,
                                      photo_crop: null,
                                      ...(event.target.checked ? { photo_original: null, photo_status: null, photo_cutout: null } : {}),
                                    }
                                  : candidate
                              )
                            );
                          }}
                        />
                        Remove photo
                      </label>
                    </div>
                  </div>

                  <div className="record-edit-field">
                    <label className="form-label" htmlFor={`record-name-${editForm.id}`}>
                      Candidate name
                    </label>
                    <CapsFixInput
                      id={`record-name-${editForm.id}`}
                      className="form-input"
                      required
                      kind="name"
                      value={editForm.name}
                      onValueChange={(value) => updateEditForm(editForm.id, 'name', value)}
                    />
                  </div>

                  <div className="record-edit-field-row">
                    <div className="record-edit-field">
                      <label className="form-label" htmlFor={`record-course-${editForm.id}`}>
                        Course
                      </label>
                      <CapsFixInput
                        id={`record-course-${editForm.id}`}
                        className="form-input"
                        kind="course"
                        value={editForm.course}
                        onValueChange={(value) => updateEditForm(editForm.id, 'course', value)}
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
              {!canSave(editForms) && <span className="photo-review-hint">Edit the photos before saving.</span>}
              <button
                type="button"
                className="secondary-button"
                onClick={closeEditModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => openEditReview()}
                disabled={savingEdit || !editForms.some((candidate) => candidate.photo_original && !candidate.no_photo)}
              >
                {reviewCount(editForms) ? `Edit photos (${reviewCount(editForms)})` : 'Edit photos'}
              </button>
              <button type="submit" className="confirm-delete-button" disabled={savingEdit || !canSave(editForms)}>
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
          initialCrop={cropTarget.initialCrop}
          onSave={handleCroppedPhoto}
          onClose={closePhotoCrop}
        />
      )}

      {addModalOpen && (
        <div className="confirmation-overlay">
          <form
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
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
                disabled={isAddingCandidates}
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
                  onChange={updateAddForm}
                  onRemove={removeAddCandidate}
                  onNoPhotoChange={setAddFormNoPhoto}
                  onPhotoChange={handleAddPhotoChange}
                  onOpenEditor={(localId, reviewed) => openAddReview(localId, reviewed ? 'crop' : 'cleanup')}
                />
              ))}
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={addAnotherCandidate}
              disabled={isAddingCandidates}
            >
              <Plus size={12} />
              Add another candidate
            </button>

            <div className="confirmation-actions">
              {!canSave(addForms) && <span className="photo-review-hint">Edit the photos before adding.</span>}
              <button
                type="button"
                className="secondary-button"
                onClick={closeAddModal}
                disabled={isAddingCandidates}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => openAddReview()}
                disabled={isAddingCandidates || !addForms.some((form) => form.photo_original && !form.no_photo)}
              >
                {reviewCount(addForms) ? `Edit photos (${reviewCount(addForms)})` : 'Edit photos'}
              </button>
              <button
                type="submit"
                className="confirm-delete-button"
                disabled={!canSave(addForms) || isAddingCandidates}
              >
                {isAddingCandidates
                    ? 'Adding...'
                    : addForms.length > 1
                      ? `Add ${addForms.length} Candidates`
                      : 'Add Candidate'}
              </button>
            </div>
          </form>
        </div>
      )}

      {reviewOpen === 'edit' && (
        <PhotoReviewDialog
          {...reviewProps('edit', editForms, setEditForms, (candidate) => candidate.id, (candidate) =>
            candidates.find((item) => item.id === candidate.id)?.name ?? 'Candidate'
          )}
        />
      )}

      {reviewOpen === 'add' && (
        <PhotoReviewDialog
          {...reviewProps('add', addForms, setAddForms, (form) => form.localId, (form, index) =>
            form.name.trim() || `Candidate ${index + 1}`
          )}
        />
      )}

    </>
  );
}

/*
 * Click-or-drop photo box for both Records forms. A dropped file must be a
 * PNG, JPG or WEBP; it attaches straight away (no background removal here -
 * that happens in Edit photos).
 */
function PhotoDropBox({ inputId, disabled, fileName, onFile }) {
  /* 'over' while a file is dragged over the box, 'rejected' after a non-photo drop */
  const [dropState, setDropState] = useState(null);

  return (
    <label
      htmlFor={inputId}
      className={`photo-upload-box ${disabled ? 'disabled' : ''} ${dropState === 'over' ? 'is-drop-target' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (disabled) {
          event.dataTransfer.dropEffect = 'none';
          return;
        }
        event.dataTransfer.dropEffect = 'copy';
        setDropState('over');
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDropState(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (disabled) return;
        const file = pickImageFile(event.dataTransfer.files);
        setDropState(file ? null : 'rejected');
        if (file) onFile(file);
      }}
    >
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      <div className="photo-upload-content">
        <span className="photo-upload-title">
          {dropState === 'over' ? 'Drop the photo here' : fileName ?? 'Upload or drop a photo'}
        </span>
        <span className={`photo-upload-subtitle ${dropState === 'rejected' ? 'is-error' : ''}`}>
          {dropState === 'rejected' ? 'Only PNG, JPG or WEBP' : 'PNG, JPG or WEBP'}
        </span>
      </div>
    </label>
  );
}

/* A photo chosen in this form session, shown through the same crop maths as a saved one. */
function LocalPhotoPreview({ file, crop, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url ? <CandidatePhoto url={url} crop={crop} alt={alt} /> : null;
}

/* The Needs editing / Edited tag beside a form's photo label. */
function ReviewChip({ entry }) {
  if (!entry.photo_original || entry.no_photo) return null;
  const pending = needsReview(entry);
  return (
    <span className={`photo-review-chip ${pending ? 'is-pending' : 'is-done'}`} data-status={entry.photo_status}>
      {pending ? 'Needs editing' : 'Edited'}
    </span>
  );
}

function AddCandidateCard({
  form,
  index,
  canRemove,
  onChange,
  onRemove,
  onNoPhotoChange,
  onPhotoChange,
  onOpenEditor,
}) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const awaitingReview = needsReview(form);

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

      <div className="photo-label-row">
        <label className="form-label" htmlFor={photoInputId}>
          Candidate photo
        </label>
        <ReviewChip entry={form} />
      </div>
      <div className="photo-upload">
        {previewUrl && !form.no_photo && (
          <div className="record-edit-photo-preview">
            <button
              type="button"
              className="record-edit-photo-preview-button"
              onClick={() => onOpenEditor(form.localId, !awaitingReview)}
              aria-label="Open the photo editor"
            >
              <CandidatePhoto url={previewUrl} crop={awaitingReview ? null : form.photo_crop} alt="Candidate preview" />
            </button>
          </div>
        )}

        <PhotoDropBox
          inputId={photoInputId}
          disabled={form.no_photo}
          fileName={(form.photo_original ?? form.photo_file)?.name}
          onFile={(file) => onPhotoChange(form.localId, file)}
        />

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
      <CapsFixInput
        id={`add-name-${form.localId}`}
        className="form-input"
        required
        kind="name"
        placeholder="Enter candidate name"
        value={form.name}
        onValueChange={(value) => onChange(form.localId, 'name', value)}
      />

      <label className="form-label" htmlFor={`add-course-${form.localId}`}>
        Course
      </label>
      <CapsFixInput
        id={`add-course-${form.localId}`}
        className="form-input"
        kind="course"
        placeholder="Course"
        value={form.course}
        onValueChange={(value) => onChange(form.localId, 'course', value)}
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

// Latest interview date first; 'unscheduled' sorts after every real date so
// open candidates settle at the end of the list instead of the top.
function compareDateKeys(a, b) {
  if (a === b) return 0;
  if (a === 'unscheduled') return 1;
  if (b === 'unscheduled') return -1;
  return b.localeCompare(a);
}
