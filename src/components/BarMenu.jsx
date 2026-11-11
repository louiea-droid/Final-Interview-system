import { useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/*
 * A dropdown for the editor bar. Items:
 *   { type: 'action', label, onSelect, disabled? }   closes the menu
 *   { type: 'check', label, checked, onToggle, hint? } stays open
 *   { type: 'group', label }                          a small heading
 *   { type: 'separator' }
 * `portal` lets the page draw the list inside the fullscreen element.
 */
export default function BarMenu({ label, title, items, icon: Icon, portal = (node) => node }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function place() {
      const trigger = triggerRef.current.getBoundingClientRect();
      const { width, height } = listRef.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(trigger.left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(trigger.bottom + 4, window.innerHeight - height - 8)),
      });
    }

    const close = () => setOpen(false);
    const closeOutside = (event) => {
      if (!event.target.closest?.('.vb-bar-menu') && !triggerRef.current?.contains(event.target)) close();
    };

    place();
    listRef.current.querySelector('[role^="menuitem"]:not(:disabled)')?.focus();
    window.addEventListener('resize', close);
    window.addEventListener('pointerdown', closeOutside, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('pointerdown', closeOutside, true);
    };
  }, [open]);

  function onKeyDown(event) {
    // keys pressed in an open menu belong to it - the page's own shortcuts
    // (Esc deselects, Delete removes, arrows nudge) must not see them
    event.stopPropagation();

    if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const entries = [...listRef.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
      const at = entries.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
      entries[(next + entries.length) % entries.length]?.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`vb-toolbar-button ${open ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {Icon && <Icon size={15} />}
        {label && <span>{label}</span>}
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open &&
        portal(
          <div
            ref={listRef}
            className="vb-bar-menu"
            role="menu"
            aria-label={title}
            style={position ?? { left: -9999, top: 0 }}
            onKeyDown={onKeyDown}
            /* a press on a heading or the padding keeps focus inside, so the
               menu only closes when focus really leaves it (Tab away) */
            onMouseDown={(event) => event.preventDefault()}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) {
                setOpen(false);
              }
            }}
          >
            {items.map((item, index) => {
              if (item.type === 'separator') return <hr key={index} />;
              if (item.type === 'group') {
                return (
                  <div key={index} className="vb-bar-menu-group" role="presentation">
                    {item.label}
                  </div>
                );
              }
              if (item.type === 'check') {
                return (
                  <button
                    key={index}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={item.checked}
                    onClick={item.onToggle}
                  >
                    <span className={`vb-bar-menu-check ${item.checked ? 'on' : ''}`} aria-hidden="true">
                      {item.checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span>{item.label}</span>
                    {item.hint && <small>{item.hint}</small>}
                  </button>
                );
              }
              return (
                <button
                  key={index}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  <span className="vb-bar-menu-check" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
    </>
  );
}
