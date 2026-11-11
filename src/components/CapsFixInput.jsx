import { useEffect, useRef, useState } from 'react';
import { CaseSensitive } from 'lucide-react';

import { properCase } from '../lib/properCase';

/*
 * A text input for a candidate's name or course with an Aa button for text
 * copied from a spreadsheet in the wrong case. The button opens a menu of
 * case styles to convert the text to. `kind` is 'name' or
 * 'course', which tunes the Capitalized rules (see properCase.js).
 */
const CASE_STYLES = [
  { label: 'Capitalized', convert: (text, kind) => properCase(text, kind) },
  { label: 'ALL CAPS', convert: (text) => text.toUpperCase() },
  { label: 'lowercase', convert: (text) => text.toLowerCase() },
];

export default function CapsFixInput({ value, onValueChange, kind = 'name', className = '', ...inputProps }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutside);
    // capture, so Esc closes this menu before it reaches the surrounding modal
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);

  return (
    <div className="caps-fix-input-wrap" ref={wrapRef}>
      <input
        {...inputProps}
        className={`${className} caps-fix-input`}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button
        type="button"
        className="caps-fix-button"
        title="Change capitals"
        aria-label="Change capitals"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!value}
        onClick={() => setOpen((current) => !current)}
      >
        <CaseSensitive size={16} />
      </button>

      {open && value && (
        <div className="caps-fix-menu" role="menu">
          {CASE_STYLES.map(({ label, convert }) => {
            const result = convert(value, kind);
            return (
              <button
                key={label}
                type="button"
                role="menuitem"
                disabled={result === value}
                onClick={() => {
                  onValueChange(result);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
