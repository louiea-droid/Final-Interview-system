import { ChevronRight } from 'lucide-react';

/* One folding group of controls in the right panel. */
export default function PropertySection({ name, open, onToggle, children }) {
  return (
    <section className={`vb-section ${open ? 'is-open' : ''}`}>
      <button type="button" className="vb-section-head" aria-expanded={open} onClick={onToggle}>
        <span>{name}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
      {open && <div className="vb-section-body">{children}</div>}
    </section>
  );
}
