'use client';

import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

import { getCroppedImageFile, type PixelCrop } from '../lib/cropImage';

export default function PhotoCropModal({
  imageSrc,
  fileName,
  onSave,
  onClose,
}: {
  imageSrc: string;
  fileName: string;
  onSave: (file: File) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!croppedAreaPixels) return;

    setSaving(true);
    setError('');

    try {
      const file = await getCroppedImageFile(imageSrc, croppedAreaPixels, fileName);
      onSave(file);
      onClose();
    } catch {
      setError('Cropping failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="confirmation-overlay" role="presentation" onClick={onClose}>
      <div
        className="photo-crop-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-crop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading-row">
          <div>
            <h2 id="photo-crop-title">Preview &amp; Crop Photo</h2>
            <p className="modal-subtitle">Drag to reposition, use the slider to zoom.</p>
          </div>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close photo preview"
          >
            &times;
          </button>
        </div>

        <div className="photo-crop-area">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <label className="photo-crop-zoom-label" htmlFor="photo-crop-zoom">
          Zoom
        </label>
        <input
          id="photo-crop-zoom"
          className="photo-crop-zoom-slider"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />

        {error && <div className="message-box">{error}</div>}

        <div className="confirmation-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-delete-button"
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
          >
            {saving ? 'Saving...' : 'Save Crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
