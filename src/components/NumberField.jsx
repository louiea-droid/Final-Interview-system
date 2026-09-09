import { useEffect, useState } from 'react';

/*
 * A small number box that sits next to a slider and types an exact value.
 *
 * It keeps what has actually been typed while the box has focus, and only
 * reads back from `value` once it doesn't. A plainly controlled input can't
 * be typed a decimal into: "2." parses to 2, the parent rounds and re-renders
 * it as "2", and the dot is gone before the next digit arrives. Holding the
 * draft means the box shows exactly what was typed until the field is left,
 * while `onCommit` still fires on every keystroke that parses to a number,
 * so the board updates as you type.
 */
export default function NumberField({
  value,
  onCommit,
  decimals = 1,
  className = '',
  ...inputProps
}) {
  const formatted = String(Number(value.toFixed(decimals)));
  const [draft, setDraft] = useState(formatted);
  const [editing, setEditing] = useState(false);

  /* while the box isn't being typed into, it mirrors the real value -
     which changes on its own when the slider or the canvas handle moves */
  useEffect(() => {
    if (!editing) setDraft(formatted);
  }, [editing, formatted]);

  return (
    <input
      {...inputProps}
      type="number"
      className={className}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = Number(event.target.value);
        if (event.target.value.trim() !== '' && Number.isFinite(next)) onCommit(next);
      }}
      onBlur={() => setEditing(false)}
    />
  );
}
