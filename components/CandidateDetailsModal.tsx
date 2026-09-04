'use client';

import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';

import { getStatusPillClass } from '../lib/candidateStatus';
import { isShownOnBoard } from '../lib/candidateVisibility';

type CandidateDetails = {
  name: string;
  photo_url: string | null;
  position: string | null;
  interview_date: string | null;
  status: string;
  created_at: string;
  show_in_visual?: boolean | null;
};

function formatInterviewDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatAddedDate(dateTime: string) {
  const parsed = new Date(dateTime);

  if (Number.isNaN(parsed.getTime())) return dateTime;

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(parsed);
}

export default function CandidateDetailsModal({
  candidate,
  onClose,
}: {
  candidate: CandidateDetails;
  onClose: () => void;
}) {
  const [photoZoomed, setPhotoZoomed] = useState(false);

  useEffect(() => {
    if (!photoZoomed) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoZoomed(false);
    };

    document.addEventListener('keydown', closeOnEscape);

    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [photoZoomed]);

  return (
    <div className="confirmation-overlay" role="presentation" onClick={onClose}>
      <div
        className="candidate-details-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-button candidate-details-close"
          onClick={onClose}
          aria-label="Close candidate details"
        >
          &times;
        </button>

        <div className="candidate-details-photo-wrap">
          {candidate.photo_url ? (
            <button
              type="button"
              className="candidate-details-photo-button"
              onClick={() => setPhotoZoomed(true)}
              aria-label={`Preview ${candidate.name}'s photo at full size`}
            >
              <img
                src={candidate.photo_url}
                alt={candidate.name}
                className="candidate-details-photo"
              />
            </button>
          ) : (
            <div className="candidate-details-photo candidate-details-photo--empty">
              <UserRound size={40} />
            </div>
          )}
        </div>

        <h2 id="candidate-details-title" className="candidate-details-name">
          {candidate.name}
        </h2>

        <span className={getStatusPillClass(candidate.status)}>
          {candidate.status}
        </span>

        <div className="candidate-details-grid">
          <div className="candidate-details-field">
            <span className="candidate-details-label">Position</span>
            <span className="candidate-details-value">
              {candidate.position || 'Not specified'}
            </span>
          </div>

          <div className="candidate-details-field">
            <span className="candidate-details-label">Interview Date</span>
            <span className="candidate-details-value">
              {candidate.interview_date
                ? formatInterviewDate(candidate.interview_date)
                : 'Not scheduled'}
            </span>
          </div>

          <div className="candidate-details-field">
            <span className="candidate-details-label">Date Added</span>
            <span className="candidate-details-value">
              {formatAddedDate(candidate.created_at)}
            </span>
          </div>

          <div className="candidate-details-field">
            <span className="candidate-details-label">Visual Board</span>
            <span className="candidate-details-value">
              {isShownOnBoard(candidate) ? 'Shown' : 'Hidden'}
            </span>
          </div>
        </div>
      </div>

      {photoZoomed && candidate.photo_url && (
        <div
          className="photo-lightbox-overlay"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            setPhotoZoomed(false);
          }}
        >
          <button
            type="button"
            className="modal-close-button photo-lightbox-close"
            onClick={(event) => {
              event.stopPropagation();
              setPhotoZoomed(false);
            }}
            aria-label="Close photo preview"
          >
            &times;
          </button>

          <img
            src={candidate.photo_url}
            alt={candidate.name}
            className="photo-lightbox-image"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
