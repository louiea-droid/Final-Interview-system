import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/**
 * Stand-in for `<input type="time">`, whose popup the browser draws in its
 * own light/blue look that CSS can't reach - same reason DateField exists.
 * Value/onChange use the native "HH:MM" 24-hour string. Every pick is
 * reported straight away; there's no Confirm step.
 */
export default function TimeField({ value, onChange, label = 'Time' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  const [hour24, minute] = value.split(':').map(Number);
  const hour12 = hour24 % 12 || 12;
  const pm = hour24 >= 12;

  function pick({ hour = hour12, min = minute, isPm = pm }) {
    onChange(`${pad((hour % 12) + (isPm ? 12 : 0))}:${pad(min)}`);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => event.key === 'Escape' && setOpen(false);
    // the popup is pinned to the window, so the page moving under it closes it
    const closeOnScroll = (event) => {
      if (!popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeNow = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    // pinned to the window (panels clip overflow), below the button or above it if there's no room
    const popover = popoverRef.current;
    const rect = rootRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom >= popover.offsetHeight + 12;
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${below ? rect.bottom + 6 : rect.top - popover.offsetHeight - 6}px`;

    // open with the chosen hour and minute scrolled to the middle of their columns
    popover.querySelectorAll('[aria-pressed="true"]').forEach((cell) => {
      const column = cell.parentElement;
      column.scrollTop = cell.offsetTop - column.clientHeight / 2 + cell.clientHeight / 2;
    });
  }, [open]);

  const column = (items, isSelected, onPick, format) =>
    items.map((item) => (
      <button
        key={item}
        type="button"
        className="time-field-cell"
        aria-pressed={isSelected(item)}
        onClick={() => onPick(item)}
      >
        {format(item)}
      </button>
    ));

  return (
    <span className="time-field" ref={rootRef}>
      <button
        type="button"
        className="time-field-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <Clock size={13} aria-hidden="true" />
        {hour12}:{pad(minute)} {pm ? 'PM' : 'AM'}
      </button>

      {open && (
        <span className="time-field-popover" ref={popoverRef} role="dialog" aria-label={label}>
          <span className="time-field-column" aria-label="Hour">
            {column(HOURS, (h) => h === hour12, (h) => pick({ hour: h }), pad)}
          </span>
          <span className="time-field-column" aria-label="Minute">
            {column(MINUTES, (m) => m === minute, (m) => pick({ min: m }), pad)}
          </span>
          <span className="time-field-column" aria-label="AM or PM">
            {column([false, true], (p) => p === pm, (p) => pick({ isPm: p }), (p) => (p ? 'PM' : 'AM'))}
          </span>
        </span>
      )}
    </span>
  );
}
