'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MINUTE_STEP = 5;

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function formatValue({ year, month, day, hour, minute }) {
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function sameDate(a, b) {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
}

function dayKey({ year, month, day }) {
  return year * 10000 + month * 100 + day;
}

// Always 6 full weeks so the grid height never jumps between months.
function buildCalendarGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), outside: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ year, month, day, outside: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const d = new Date(last.year, last.month, last.day + 1);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), outside: true });
  }
  return cells;
}

/**
 * Drop-in replacement for `<input type="datetime-local">`, styled like
 * DateField (which replaces `<input type="date">` the same way) rather than
 * the browser's own date+time picker - see the comment there for why.
 * Value/onChange use the same "YYYY-MM-DDTHH:mm" local string the native
 * input did. `min`, if given, is the same string; days before it are
 * unselectable, and on the earliest selectable day its time is the floor.
 */
export default function DateTimeField({
  id,
  value,
  onChange,
  min,
  placeholder = 'Select date and time',
  disabled = false,
}) {
  const selected = parseValue(value);
  const today = new Date();
  const minValue = parseValue(min);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.year ?? minValue?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.month ?? minValue?.month ?? today.getMonth());
  const [draft, setDraft] = useState(selected);
  const [popoverStyle, setPopoverStyle] = useState({});

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;

    const margin = 8;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const popoverWidth = popoverRef.current?.offsetWidth ?? 272;
      const popoverHeight = popoverRef.current?.offsetHeight ?? 400;

      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - popoverWidth - margin)
      );

      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < popoverHeight + margin && rect.top > popoverHeight + margin;

      setPopoverStyle({
        position: 'fixed',
        left,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    };

    updatePosition();

    const handlePointerDown = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  function openPicker() {
    if (disabled) return;
    const current = parseValue(value);
    // Matches DateField: nothing shows as picked until a day is actually
    // clicked. Pre-selecting today here used to highlight a day in the grid
    // before the admin had chosen anything, while the field above still
    // read "Select date and time" - a selected-looking day that wasn't
    // actually selected, easy to mistake for a stuck/broken picker.
    setDraft(current);
    setViewYear(current?.year ?? minValue?.year ?? today.getFullYear());
    setViewMonth(current?.month ?? minValue?.month ?? today.getMonth());
    setOpen(true);
  }

  function handleConfirm() {
    if (draft) onChange(formatValue(draft));
    setOpen(false);
  }

  function handleClear() {
    onChange('');
    setDraft(null);
    setOpen(false);
  }

  function selectDay(cell) {
    const isMinDay = minValue && dayKey(cell) === dayKey(minValue);

    setDraft((current) => {
      const hour = isMinDay ? Math.max(current?.hour ?? 0, minValue.hour) : (current?.hour ?? 9);
      // On the earliest selectable day, defaulting the minute to 0 (or
      // whatever it already was) can land before the minute the hour
      // itself was just clamped up to - a time earlier than `min` that the
      // minute dropdown then can't even display as selected, since that
      // option is exactly what it filters out.
      const atMinHour = isMinDay && hour === minValue.hour;
      const minMinute = atMinHour ? Math.ceil(minValue.minute / MINUTE_STEP) * MINUTE_STEP : 0;
      const minute = Math.max(current?.minute ?? 0, minMinute) % 60;

      return { year: cell.year, month: cell.month, day: cell.day, hour, minute };
    });
    if (cell.outside) {
      setViewYear(cell.year);
      setViewMonth(cell.month);
    }
  }

  const cells = buildCalendarGrid(viewYear, viewMonth);
  const years = Array.from({ length: 12 }, (_, i) => (minValue?.year ?? today.getFullYear()) - 1 + i);
  const label = selected
    ? `${MONTHS[selected.month]} ${selected.day}, ${selected.year}, ${formatTime(selected.hour, selected.minute)}`
    : '';

  const draftIsMinDay = minValue && draft && dayKey(draft) === dayKey(minValue);
  const hourOptions = Array.from({ length: 24 }, (_, h) => h).filter(
    (h) => !draftIsMinDay || h >= minValue.hour
  );
  const minuteOptions = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP).filter(
    (m) => !draftIsMinDay || draft.hour > minValue.hour || m >= minValue.minute
  );

  return (
    <div className="date-field">
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="form-input date-field-trigger"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={label ? undefined : 'date-field-placeholder'}>{label || placeholder}</span>
        <CalendarClock size={15} />
      </button>

      {open && (
        <div
          className="date-field-popover"
          ref={popoverRef}
          style={popoverStyle}
          role="dialog"
          aria-label="Choose date and time"
        >
          <div className="date-field-header">
            <select
              className="form-select date-field-select"
              value={viewMonth}
              onChange={(event) => setViewMonth(Number(event.target.value))}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </select>
            <select
              className="form-select date-field-select"
              value={viewYear}
              onChange={(event) => setViewYear(Number(event.target.value))}
            >
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="date-field-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="date-field-grid">
            {cells.map((cell) => {
              const isSelected = sameDate(draft, cell);
              const isToday = sameDate({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }, cell);
              const isPastMin = minValue && dayKey(cell) < dayKey(minValue);

              return (
                <button
                  type="button"
                  key={`${cell.year}-${cell.month}-${cell.day}-${cell.outside ? 1 : 0}`}
                  className={[
                    'date-field-day',
                    cell.outside && 'outside',
                    isSelected && 'selected',
                    isToday && !isSelected && 'today',
                  ].filter(Boolean).join(' ')}
                  disabled={isPastMin}
                  onClick={() => selectDay(cell)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="date-field-time">
            <CalendarClock size={13} aria-hidden="true" />
            <select
              className="form-select date-field-select"
              disabled={!draft}
              value={draft?.hour ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, hour: Number(event.target.value) }))
              }
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>{formatHourLabel(h)}</option>
              ))}
            </select>
            <span className="date-field-time-sep">:</span>
            <select
              className="form-select date-field-select"
              disabled={!draft}
              value={draft?.minute ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minute: Number(event.target.value) }))
              }
            >
              {minuteOptions.map((m) => (
                <option key={m} value={m}>{pad(m)}</option>
              ))}
            </select>
          </div>

          <div className="date-field-actions">
            <button type="button" className="date-field-clear-button" onClick={handleClear}>
              Clear
            </button>
            <div className="date-field-actions-right">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleConfirm} disabled={!draft}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatHourLabel(hour) {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${pad(twelveHour)} ${period}`;
}

function formatTime(hour, minute) {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${pad(minute)} ${period}`;
}
