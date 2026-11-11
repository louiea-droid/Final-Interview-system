/* The small picture at the start of each Layers row, so a row can be found by eye. */
import { FONT_STACKS } from './textStyle.js';

const DEFAULT_LOGO = '/visual/logo.png'; // what the board draws without a custom logo
const ICON = { type: 'icon' };

/* A fill's main colour: a solid's own, or a gradient's first stop. */
function fillColour(fill) {
  if (fill?.type === 'gradient') return fill.stops?.[0]?.color ?? null;
  return fill?.color ?? null;
}

export function layerThumb(kind, element) {
  if (!element) return ICON;
  if (kind === 'text') {
    return {
      type: 'text',
      font: FONT_STACKS[element.style?.fontFamily] ?? FONT_STACKS.inter,
      color: fillColour(element.style?.fill) ?? '#f0d689',
    };
  }
  if (kind === 'image') return element.url ? { type: 'photo', url: element.url } : ICON;
  if (kind === 'logo') return { type: 'photo', url: element.url || DEFAULT_LOGO };
  if (kind === 'shape') {
    if (element.fill?.type === 'image') {
      const url = element.fill.url ?? element.photos?.[0]?.url;
      return url ? { type: 'photo', url } : ICON;
    }
    const colour = fillColour(element.fill);
    return colour ? { type: 'colour', colour } : ICON;
  }
  return ICON;
}
