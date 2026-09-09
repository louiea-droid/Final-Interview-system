import { useEffect, useState } from 'react';
import { Image as ImageIcon, Palette, Plus, Trash2, Video as VideoIcon, Waves } from 'lucide-react';

import {
  COLOR_FORMATS,
  COLOR_PALETTE,
  GRADIENT_PRESETS,
  fillPreviewCss,
  formatColor,
  gradientFill,
  imageFill,
  normalizeFill,
  parseColor,
  solidFill,
  videoFill,
} from '../lib/fill';
import { FIT_OPTIONS } from '../lib/shapeStyle';

const TABS = [
  { value: 'solid', label: 'Solid', icon: Palette },
  { value: 'gradient', label: 'Gradient', icon: Waves },
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: VideoIcon },
];

/* Keeps a gradient's colours when switching to solid, and the other way round. */
function toSolid(fill) {
  if (fill.type === 'solid') return fill;
  const color = fill.type === 'gradient' ? fill.stops[0].color : '#f4ca5d';
  return solidFill(color, fill.opacity);
}

function toGradient(fill) {
  if (fill.type === 'gradient') return fill;

  const base = fill.type === 'solid' ? fill.color : '#f4ca5d';
  return gradientFill(
    'linear',
    180,
    [
      { color: base, position: 0 },
      { color: '#0b0102', position: 100 },
    ],
    fill.opacity
  );
}

/*
 * The fill picker: a palette with HEX / RGB / HSL entry, gradient presets
 * plus a stop editor, and - for shapes and photo frames - an image fill.
 * Shared by every element the board can paint.
 */
export default function FillEditor({
  fill,
  onChange,
  allowImage = false,
  onUploadImage,
  uploadId,
  allowVideo = false,
  onUploadVideo,
  videoUploadId,
}) {
  const resolved = normalizeFill(fill);

  const [format, setFormat] = useState('hex');
  const [colorDraft, setColorDraft] = useState('');

  /*
   * The text field mirrors the fill until it is focused, so typing a partial
   * value ("#f4c") isn't overwritten mid-keystroke by the resolved colour.
   */
  const [editingColor, setEditingColor] = useState(false);
  const solidColor = resolved.type === 'solid' ? resolved.color : null;

  useEffect(() => {
    if (!editingColor && solidColor) setColorDraft(formatColor(solidColor, format));
  }, [editingColor, solidColor, format]);

  const tabs = TABS.filter((tab) => {
    if (tab.value === 'image') return allowImage;
    if (tab.value === 'video') return allowVideo;
    return true;
  });

  function switchType(type) {
    if (type === resolved.type) return;
    if (type === 'solid') onChange(toSolid(resolved));
    if (type === 'gradient') onChange(toGradient(resolved));
    if (type === 'image') onChange(imageFill(null, 'cover', resolved.opacity));
    if (type === 'video') onChange(videoFill(null, 'cover', resolved.opacity));
  }

  function setOpacity(opacity) {
    onChange({ ...resolved, opacity });
  }

  function setStop(index, patch) {
    onChange({
      ...resolved,
      stops: resolved.stops.map((stop, at) => (at === index ? { ...stop, ...patch } : stop)),
    });
  }

  function addStop() {
    const last = resolved.stops[resolved.stops.length - 1];
    onChange({
      ...resolved,
      stops: [...resolved.stops, { color: last.color, position: 100 }],
    });
  }

  function removeStop(index) {
    if (resolved.stops.length <= 2) return;
    onChange({ ...resolved, stops: resolved.stops.filter((_, at) => at !== index) });
  }

  return (
    <div className="vb-fill">
      <div className="vb-fill-head">
        <span className="vb-fill-preview" style={fillPreviewCss(resolved)} aria-hidden="true" />

        <div className="vb-segment">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                type="button"
                className={`vb-segment-button ${resolved.type === tab.value ? 'active' : ''}`}
                onClick={() => switchType(tab.value)}
                title={tab.label}
                aria-label={tab.label}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
      </div>

      {resolved.type === 'solid' && (
        <>
          <div className="vb-palette">
            {COLOR_PALETTE.map((row, rowIndex) => (
              <div key={rowIndex} className="vb-palette-row">
                {row.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`vb-palette-swatch ${resolved.color === color ? 'active' : ''}`}
                    style={{ background: color }}
                    title={color}
                    aria-label={color}
                    onClick={() => onChange(solidFill(color, resolved.opacity))}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="vb-color-fields">
            <select
              className="form-select vb-color-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              aria-label="Colour format"
            >
              {COLOR_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              className="form-input vb-color-text"
              value={colorDraft}
              aria-label={`Colour value in ${format.toUpperCase()}`}
              onFocus={() => setEditingColor(true)}
              onBlur={() => {
                setEditingColor(false);
                setColorDraft(formatColor(resolved.color, format));
              }}
              onChange={(event) => {
                setColorDraft(event.target.value);
                const parsed = parseColor(event.target.value, format);
                if (parsed) onChange(solidFill(parsed, resolved.opacity));
              }}
            />

            <input
              type="color"
              className="vb-color-input"
              value={resolved.color}
              title="Pick a colour"
              aria-label="Pick a colour"
              onChange={(event) => onChange(solidFill(event.target.value, resolved.opacity))}
            />
          </div>
        </>
      )}

      {resolved.type === 'gradient' && (
        <>
          <div className="vb-gradient-presets">
            {GRADIENT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="vb-gradient-preset"
                style={fillPreviewCss(preset.fill)}
                title={preset.label}
                aria-label={preset.label}
                onClick={() => onChange({ ...preset.fill, opacity: resolved.opacity })}
              />
            ))}
          </div>

          <div className="vb-fill-row">
            <div className="vb-segment">
              <button
                type="button"
                className={`vb-segment-button is-wide ${
                  resolved.gradient === 'linear' ? 'active' : ''
                }`}
                onClick={() => onChange({ ...resolved, gradient: 'linear' })}
              >
                Linear
              </button>
              <button
                type="button"
                className={`vb-segment-button is-wide ${
                  resolved.gradient === 'radial' ? 'active' : ''
                }`}
                onClick={() => onChange({ ...resolved, gradient: 'radial' })}
              >
                Radial
              </button>
            </div>
          </div>

          {resolved.gradient === 'linear' && (
            <div className="scale-field">
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={resolved.angle}
                aria-label="Gradient angle"
                onChange={(event) => onChange({ ...resolved, angle: Number(event.target.value) })}
              />
              <span className="scale-field-value">{resolved.angle}&deg;</span>
            </div>
          )}

          <div className="vb-stops">
            {resolved.stops.map((stop, index) => (
              <div key={index} className="vb-stop-row">
                <input
                  type="color"
                  className="vb-color-input"
                  value={stop.color}
                  aria-label={`Stop ${index + 1} colour`}
                  onChange={(event) => setStop(index, { color: event.target.value })}
                />
                <input
                  type="number"
                  className="form-input vb-stop-position"
                  min="0"
                  max="100"
                  value={Math.round(stop.position)}
                  aria-label={`Stop ${index + 1} position`}
                  onChange={(event) => setStop(index, { position: Number(event.target.value) })}
                />
                <button
                  type="button"
                  className="delete-button"
                  disabled={resolved.stops.length <= 2}
                  onClick={() => removeStop(index)}
                  aria-label={`Remove stop ${index + 1}`}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            <button type="button" className="secondary-button vb-add-stop" onClick={addStop}>
              <Plus size={12} />
              Add stop
            </button>
          </div>
        </>
      )}

      {resolved.type === 'image' && (
        <>
          <div className="photo-upload">
            <label htmlFor={uploadId} className="photo-upload-box">
              <input
                id={uploadId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void onUploadImage?.(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
              <div className="photo-upload-content">
                <span className="photo-upload-title">
                  {resolved.url ? 'Replace photo' : 'Insert a photo'}
                </span>
                <span className="photo-upload-subtitle">PNG, JPG or WEBP</span>
              </div>
            </label>
          </div>

          <div className="vb-fill-row">
            <div className="vb-segment">
              {FIT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`vb-segment-button is-wide ${
                    resolved.fit === option.value ? 'active' : ''
                  }`}
                  onClick={() => onChange({ ...resolved, fit: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {resolved.url && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onChange(imageFill(null, resolved.fit, resolved.opacity))}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {resolved.type === 'video' && (
        <>
          <div className="photo-upload">
            <label htmlFor={videoUploadId} className="photo-upload-box">
              <input
                id={videoUploadId}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={(event) => {
                  void onUploadVideo?.(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
              <div className="photo-upload-content">
                <span className="photo-upload-title">
                  {resolved.url ? 'Replace video' : 'Insert a video'}
                </span>
                <span className="photo-upload-subtitle">MP4, WEBM or MOV, up to 50MB</span>
              </div>
            </label>
          </div>

          <div className="vb-fill-row">
            <div className="vb-segment">
              {FIT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`vb-segment-button is-wide ${
                    resolved.fit === option.value ? 'active' : ''
                  }`}
                  onClick={() => onChange({ ...resolved, fit: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {resolved.url && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onChange(videoFill(null, resolved.fit, resolved.opacity))}
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">Opacity</label>
        <div className="scale-field">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={resolved.opacity}
            aria-label="Fill opacity"
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
          <span className="scale-field-value">{Math.round(resolved.opacity * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
