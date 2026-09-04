'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays } from 'lucide-react';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type PlainDate = { year: number; month: number; day: number };

function parseDateValue(value: string): PlainDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function formatDateValue({ year, month, day }: PlainDate): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sameDate(a: PlainDate | null, b: PlainDate | null): boolean {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
}

// Always 6 full weeks so the grid height never jumps between months.
function buildCalendarGrid(year: number, month: number): (PlainDate & { outside: boolean })[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (PlainDate & { outside: boolean })[] = [];

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
 * Drop-in replacement for `<input type="date">`. Native date pickers are
 * rendered by the browser/OS outside the page (no CSS can reach them, and
 * iPhone Safari's looks nothing like desktop Chrome's) — this renders its
 * own calendar so it always matches the app's own modal styling everywhere.
 * Value/onChange use the same "YYYY-MM-DD" string the native input did.
 */
export default function DateField({
  id,
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = parseDateValue(value);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.getMonth());
  const [draft, setDraft] = useState<PlainDate | null>(selected);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const margin = 8;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const popoverWidth = popoverRef.current?.offsetWidth ?? 272;
      const popoverHeight = popoverRef.current?.offsetHeight ?? 320;

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

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeydown = (event: KeyboardEvent) => {
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
    const current = parseDateValue(value);
    setDraft(current);
    setViewYear(current?.year ?? today.getFullYear());
    setViewMonth(current?.month ?? today.getMonth());
    setOpen(true);
  }

  function handleConfirm() {
    if (draft) onChange(formatDateValue(draft));
    setOpen(false);
  }

  function handleClear() {
    onChange('');
    setDraft(null);
    setOpen(false);
  }

  const cells = buildCalendarGrid(viewYear, viewMonth);
  const years = Array.from({ length: 12 }, (_, i) => today.getFullYear() - 3 + i);
  const label = selected ? `${MONTHS[selected.month]} ${selected.day}, ${selected.year}` : '';

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
        <CalendarDays size={15} />
      </button>

      {open && (
        <div
          className="date-field-popover"
          ref={popoverRef}
          style={popoverStyle}
          role="dialog"
          aria-label="Choose date"
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
                  onClick={() => {
                    setDraft({ year: cell.year, month: cell.month, day: cell.day });
                    if (cell.outside) {
                      setViewYear(cell.year);
                      setViewMonth(cell.month);
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
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
