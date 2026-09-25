/*
 * Pure geometry for the Visual Board editor. Positions and bounds are board
 * percentages (x of the width, y of the height); resize and rotate work in
 * pixels, because rotation mixes the two axes.
 */

const RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rotate({ x, y }, degrees) {
  const cos = Math.cos(degrees * RAD);
  const sin = Math.sin(degrees * RAD);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export const BOARD_FRAME = { left: 0, top: 0, right: 100, bottom: 100 };

export function normalizeAngle(degrees) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function fromEdges(left, top, right, bottom) {
  return { left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}

/** The axis-aligned box an element covers, from its centre, px size and rotation. */
export function boundsOf({ x, y, wPx, hPx, rotation = 0 }, { W, H }) {
  const cos = Math.abs(Math.cos(rotation * RAD));
  const sin = Math.abs(Math.sin(rotation * RAD));
  const w = ((wPx * cos + hPx * sin) / W) * 100;
  const h = ((wPx * sin + hPx * cos) / H) * 100;
  return fromEdges(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
}

export function shiftBounds(b, dx, dy) {
  return fromEdges(b.left + dx, b.top + dy, b.right + dx, b.bottom + dy);
}

export function unionBounds(list) {
  return fromEdges(
    Math.min(...list.map((b) => b.left)),
    Math.min(...list.map((b) => b.top)),
    Math.max(...list.map((b) => b.right)),
    Math.max(...list.map((b) => b.bottom))
  );
}

export function alignDeltas(list, edge, frame) {
  const midX = (frame.left + frame.right) / 2;
  const midY = (frame.top + frame.bottom) / 2;

  return list.map((b) => {
    switch (edge) {
      case 'left': return { dx: frame.left - b.left, dy: 0 };
      case 'center': return { dx: midX - b.cx, dy: 0 };
      case 'right': return { dx: frame.right - b.right, dy: 0 };
      case 'top': return { dx: 0, dy: frame.top - b.top };
      case 'middle': return { dx: 0, dy: midY - b.cy };
      default: return { dx: 0, dy: frame.bottom - b.bottom };
    }
  });
}

/** Equal gaps between neighbours; the first and last (by centre) stay put. */
export function distributeDeltas(list, axis) {
  const deltas = list.map(() => ({ dx: 0, dy: 0 }));
  if (list.length < 3) return deltas;

  const [start, end, size, center, key] =
    axis === 'x' ? ['left', 'right', 'w', 'cx', 'dx'] : ['top', 'bottom', 'h', 'cy', 'dy'];
  const order = list.map((b, index) => ({ b, index })).sort((a, c) => a.b[center] - c.b[center]);
  const first = order[0].b;
  const last = order[order.length - 1].b;
  const total = list.reduce((sum, b) => sum + b[size], 0);
  const gap = (last[end] - first[start] - total) / (list.length - 1);

  let cursor = first[start];
  for (const { b, index } of order) {
    deltas[index][key] = cursor - b[start];
    cursor += b[size] + gap;
  }

  return deltas;
}

function closestOffset(lines, targets, threshold) {
  let best = null;
  for (const line of lines) {
    for (const target of targets) {
      const offset = target - line;
      if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
    }
  }
  return best ?? 0;
}

function gridLines(step) {
  if (!step) return [];
  const lines = [];
  for (let at = 0; at <= 100; at += step) lines.push(at);
  return lines;
}

function matchedGuides(axis, lines, targets) {
  const hits = new Set();
  for (const target of targets) {
    if (lines.some((line) => Math.abs(line - target) < 0.01)) hits.add(Math.round(target * 100) / 100);
  }
  return [...hits].map((at) => ({ axis, at }));
}

/**
 * Snaps a moving box's edges and centre to the board's 0/50/100 lines, to
 * other elements' edges and centres, and (when `grid` is set) to grid lines.
 * Grid lines snap but are not reported as guides.
 */
export function snapMove(moving, others, { threshold, grid = 0 }) {
  const xs = [0, 50, 100, ...others.flatMap((o) => [o.left, o.cx, o.right])];
  const ys = [0, 50, 100, ...others.flatMap((o) => [o.top, o.cy, o.bottom])];
  const grids = gridLines(grid);

  const dx = closestOffset([moving.left, moving.cx, moving.right], [...xs, ...grids], threshold);
  const dy = closestOffset([moving.top, moving.cy, moving.bottom], [...ys, ...grids], threshold);
  const snapped = shiftBounds(moving, dx, dy);

  return {
    dx,
    dy,
    guides: [
      ...matchedGuides('x', [snapped.left, snapped.cx, snapped.right], xs),
      ...matchedGuides('y', [snapped.top, snapped.cy, snapped.bottom], ys),
    ],
  };
}

/** The gap to the nearest neighbour on each side that overlaps on the other axis. */
export function gapsAround(moving, others) {
  const gaps = [];
  const nearest = (candidates, distance) =>
    candidates.reduce((best, o) => (best === null || distance(o) < distance(best) ? o : best), null);

  const beside = others.filter((o) => o.top < moving.bottom && o.bottom > moving.top);
  const stacked = others.filter((o) => o.left < moving.right && o.right > moving.left);

  const left = nearest(beside.filter((o) => o.right <= moving.left), (o) => moving.left - o.right);
  const right = nearest(beside.filter((o) => o.left >= moving.right), (o) => o.left - moving.right);
  const above = nearest(stacked.filter((o) => o.bottom <= moving.top), (o) => moving.top - o.bottom);
  const below = nearest(stacked.filter((o) => o.top >= moving.bottom), (o) => o.top - moving.bottom);

  const midY = (o) => (Math.max(o.top, moving.top) + Math.min(o.bottom, moving.bottom)) / 2;
  const midX = (o) => (Math.max(o.left, moving.left) + Math.min(o.right, moving.right)) / 2;

  if (left) gaps.push({ axis: 'x', from: left.right, to: moving.left, at: midY(left) });
  if (right) gaps.push({ axis: 'x', from: moving.right, to: right.left, at: midY(right) });
  if (above) gaps.push({ axis: 'y', from: above.bottom, to: moving.top, at: midX(above) });
  if (below) gaps.push({ axis: 'y', from: moving.bottom, to: below.top, at: midX(below) });

  return gaps;
}

/**
 * Resizes a (possibly rotated) box by one of its 8 handles. The opposite side
 * stays put unless `fromCenter`; `keepRatio` scales both sides together.
 */
export function resizeFromHandle(
  start,
  handle,
  pointer,
  { keepRatio = false, fromCenter = false, minW = 1, maxW = Infinity, minH = 1, maxH = Infinity } = {}
) {
  const rotation = start.rotation ?? 0;
  const local = rotate({ x: pointer.x - start.cx, y: pointer.y - start.cy }, -rotation);

  function side(direction, pointerAt, size, min, max) {
    if (direction === 0) return { size, center: 0 };
    if (fromCenter) return { size: clamp(2 * direction * pointerAt, min, max), center: 0 };
    const anchor = (-direction * size) / 2;
    const next = clamp(direction * (pointerAt - anchor), min, max);
    return { size: next, center: anchor + (direction * next) / 2 };
  }

  let x = side(handle.x, local.x, start.w, minW, maxW);
  let y = side(handle.y, local.y, start.h, minH, maxH);

  if (keepRatio) {
    const wanted =
      handle.x && handle.y
        ? Math.max(x.size / start.w, y.size / start.h)
        : handle.x
          ? x.size / start.w
          : y.size / start.h;
    const factor = clamp(
      wanted,
      Math.max(minW / start.w, minH / start.h),
      Math.min(maxW / start.w, maxH / start.h)
    );

    const scaled = (direction, size) => {
      const next = size * factor;
      if (direction === 0 || fromCenter) return { size: next, center: 0 };
      const anchor = (-direction * size) / 2;
      return { size: next, center: anchor + (direction * next) / 2 };
    };

    x = scaled(handle.x, start.w);
    y = scaled(handle.y, start.h);
  }

  const offset = rotate({ x: x.center, y: y.center }, rotation);
  return { cx: start.cx + offset.x, cy: start.cy + offset.y, w: x.size, h: y.size };
}

/** Resizes a one-dimensional span (a divider) by one of its two ends. */
export function resizeSpan({ center, length }, end, pointer, { fromCenter = false, min = 0, max = Infinity } = {}) {
  if (fromCenter) return { center, length: clamp(2 * end * (pointer - center), min, max) };
  const anchor = center - (end * length) / 2;
  const next = clamp(end * (pointer - anchor), min, max);
  return { center: anchor + (end * next) / 2, length: next };
}

/** A new rotation from how far the pointer has turned around `center` since the grab. */
export function rotationFromDrag(startRotation, center, startPointer, pointer, snap) {
  const angle = (p) => Math.atan2(p.y - center.y, p.x - center.x) / RAD;
  const degrees = normalizeAngle(startRotation + angle(pointer) - angle(startPointer));
  return snap ? normalizeAngle(Math.round(degrees / 15) * 15) : degrees;
}
