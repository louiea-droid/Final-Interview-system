/*
 * Where the floating action bar sits: centred above the selection, flipped
 * below when there's no room, and kept inside the visible stage. All rects
 * are client px ({ left, top, right, bottom }); the bar is { width, height }.
 * Returns null when the selection is scrolled out of the stage.
 */
export function placeFloatingBar(sel, stage, bar, gap = 8, margin = 4) {
  const overlaps =
    sel.right > stage.left && sel.left < stage.right && sel.bottom > stage.top && sel.top < stage.bottom;
  if (!overlaps) return null;

  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

  const centre = (sel.left + sel.right) / 2;
  const left = clamp(centre - bar.width / 2, stage.left + margin, stage.right - bar.width - margin);

  const above = sel.top - gap - bar.height;
  if (above >= stage.top + margin) return { left, top: above, placement: 'above' };

  const below = clamp(sel.bottom + gap, stage.top + margin, stage.bottom - bar.height - margin);
  return { left, top: below, placement: 'below' };
}
