/* The Text tab's click-to-add styles, in the board's own fonts and gold. */
import { solidFill } from './fill.js';
import { DEFAULT_CLOSING_STYLE, DEFAULT_EXTRA_TEXT_STYLE, DEFAULT_HEADING_STYLE } from './textStyle.js';

const BODY_STYLE = {
  ...DEFAULT_EXTRA_TEXT_STYLE,
  weight: 400,
  lineHeight: 1.4,
  fill: solidFill('#e6e6e6'),
};

export const TEXT_PRESETS = [
  { id: 'heading', label: 'Heading', text: 'Heading', fontSize: 5, bulletList: false, style: DEFAULT_HEADING_STYLE },
  {
    id: 'subheading',
    label: 'Subheading',
    text: 'Subheading',
    fontSize: 3.4,
    bulletList: false,
    style: { ...DEFAULT_EXTRA_TEXT_STYLE, weight: 700, fill: solidFill('#f2f2f2') },
  },
  { id: 'body', label: 'Body', text: 'Body text for details and notes', fontSize: 2, bulletList: false, style: BODY_STYLE },
  { id: 'bullets', label: 'Bullet list', text: 'First point\nSecond point', fontSize: 2, bulletList: true, style: BODY_STYLE },
  { id: 'script', label: 'Script', text: 'Best of Luck!', fontSize: 4.4, bulletList: false, style: DEFAULT_CLOSING_STYLE },
];
