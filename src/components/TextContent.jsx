import { resolveTextStyle } from "../lib/textStyle";

/*
 * A text element's content - shared between the live board and the admin
 * editor's canvas. Ordinary text just renders as-is; when `bulletList` is
 * set, each non-empty line becomes its own bulleted item instead of one
 * wrapped block of running text.
 *
 * Bullet rows are always left-aligned regardless of the text's own
 * `align` setting - a centered or right-aligned list of bullets reads as
 * ragged rather than as a list - while the block as a whole still sits
 * whichever way the element is positioned.
 *
 * Every line re-applies the text's full style (font, fill, shadow) rather
 * than relying on inheritance: a gradient fill paints through
 * `background-clip: text`, which clips to each element's own glyphs, so a
 * nested span with no fill of its own would render invisible text instead
 * of inheriting the gradient.
 */
export default function TextContent({ text }) {
  if (!text.bulletList) return text.text;

  const lines = text.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const lineStyle = resolveTextStyle(text);

  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", gap: "0.3em", textAlign: "left" }}
    >
      {lines.map((line, index) => (
        <span key={index} style={{ display: "flex", alignItems: "baseline", gap: "0.5em" }}>
          <span aria-hidden="true" style={lineStyle}>
            &bull;
          </span>
          <span style={lineStyle}>{line}</span>
        </span>
      ))}
    </span>
  );
}
