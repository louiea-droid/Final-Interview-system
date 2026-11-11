import { MEDIA_STROKE, STROKE_STYLES } from '../lib/shapeStyle';

/*
 * A border's colour, width and line style - shapes, frames, photos, videos,
 * and a text's outline. `showStyle` is off for the zigzag (whose stroke is
 * its drawn line) and the outline.
 */
export default function BorderControls({ stroke, onChange, showStyle = true, label = 'Border', max = 16, step = 1 }) {
  const value = { ...MEDIA_STROKE, ...stroke };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="vb-stroke-field">
        <input
          type="color"
          className="vb-color-input"
          value={value.color}
          aria-label={`${label} colour`}
          onChange={(event) => onChange({ color: event.target.value })}
        />
        <input
          type="range"
          min="0"
          max={max}
          step={step}
          value={value.width}
          aria-label={`${label} width`}
          onChange={(event) => onChange({ width: Number(event.target.value) })}
        />
        <span className="scale-field-value">{value.width}px</span>
      </div>
      {showStyle && (
        <div className="vb-segment vb-border-style">
          {STROKE_STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`vb-segment-button ${value.style === option.value ? 'active' : ''}`}
              aria-pressed={value.style === option.value}
              onClick={() => onChange({ style: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
