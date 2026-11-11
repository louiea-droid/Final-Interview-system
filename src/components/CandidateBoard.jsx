import CandidatePhoto from "./CandidatePhoto";
import { CARD_DEFAULTS, NAME_BAR_HEIGHT, boardPx } from "../lib/candidateCard";

/*
 * The candidate board's contents: an empty-state message, or the looping
 * carousel of candidate cards. Shared between the live board
 * (VisualBoard.jsx) and the admin editor's canvas (AdminVisualBoard.jsx),
 * so what the editor shows inside the candidate box is the real thing at a
 * smaller size rather than a hand-drawn approximation of it.
 *
 * Widths (cqw) read against this board's own box; heights and text sizes
 * (cqh, via boardPx) read against the whole board - this box is only an
 * inline-size container, so cqh passes through it. That's what keeps the
 * name and course one size however the box or its cards are resized.
 *
 * `perRow` is how many candidates sit across one row, and `look` (see
 * candidateCard.js) how wide each card is within its column, how tall its
 * photo is, and the name and course text sizes. A row shorter than `perRow` (the last one, when the count doesn't divide
 * evenly) gets its own column count so its cards stretch to fill the row
 * rather than leaving empty cells.
 *
 * The scroll runs at a constant pace regardless of how many candidates
 * there are - more candidates means a longer loop, not a faster one. The
 * card list is rendered twice back to back and animated from 0 to -50%,
 * i.e. exactly one copy's height, so it loops seamlessly no matter how
 * tall a "copy" actually is.
 */

/* Space between rows - what 2% of the default box's height used to be. */
const ROW_GAP = boardPx(16);

/* Groups a flat list into rows of `size`. */
function chunkIntoRows(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
}

/* One candidate box - photo on top, gold name bar below. The card takes
   `look.cardWidth`% of its column, centred; the photo's height is a share
   of the card's width; the bar fills whatever height is left in its row, so
   every bar in a row lines up even when one name runs to two lines. */
function CandidateCard({ candidate, look }) {
  return (
    <div
      className="flex flex-col justify-self-center overflow-hidden rounded-[3px] border border-[#c9a03c] bg-[#2e0505]"
      style={{ width: `${look.cardWidth}%` }}
    >
      <div
        className="relative shrink-0 overflow-hidden bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#a51d1d_0%,#6d1010_45%,#2e0505_100%)]"
        style={{ aspectRatio: `100 / ${look.photoHeight}` }}
      >
        {candidate.photo_url && (
          <CandidatePhoto
            url={candidate.photo_url}
            crop={candidate.photo_crop}
            alt={candidate.name}
            position="top"
            className="absolute inset-0"
          />
        )}
      </div>

      <div
        className="
          relative
          flex
          flex-1
          flex-col
          items-center
          justify-center
          px-1
          py-1
          text-center

          bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]
        "
        style={{ minHeight: boardPx(NAME_BAR_HEIGHT) }}
      >
        {/* Always the size that was set: a long name wraps onto balanced lines
            rather than shrinking. */}
        <span
          className="
            block
            break-words
            w-full
            font-magneton
            leading-[1.1]
            tracking-[0.01em]
            text-[#560606]
            [text-shadow:1px_1px_1px_rgba(63,39,10,.3)]
          "
          style={{ fontSize: boardPx(look.nameSize), textWrap: "balance" }}
        >
          {candidate.name}
        </span>

        {candidate.course && (
          <span
            className="
              line-clamp-2
              break-words
              w-full
              font-bold
              uppercase
              leading-[1.15]
              tracking-wider
              text-[#2e1604]/80
            "
            style={{ fontSize: boardPx(look.courseSize), textWrap: "balance" }}
            title={candidate.course}
          >
            {candidate.course}
          </span>
        )}

      </div>
    </div>
  );
}

export default function CandidateBoard({
  candidates,
  perRow = 2,
  secondsPerCard = 4,
  look = CARD_DEFAULTS,
}) {
  if (candidates.length === 0) {
    return (
      <div
        className={`
          flex
          h-full
          w-full
          items-center
          justify-center
          px-2
          text-center
          text-[clamp(11px,1.3vw,14px)]
          text-[#f0d689]
        `}
      >
        No final interview applicants currently listed.
      </div>
    );
  }

  /* Set per board in the editor; the pace is per card, not per loop - and
     a short list still needs long enough not to be a blur. */
  const duration = Math.max(secondsPerCard * 4, candidates.length * secondsPerCard);
  const rows = chunkIntoRows(candidates, perRow);

  return (
    <div className="relative h-full w-full overflow-hidden [container-type:inline-size]">
      <div
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          gap: ROW_GAP,
          animation: `carousel-scroll ${duration}s linear infinite`,
        }}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex flex-col" style={{ gap: ROW_GAP }}>
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="grid shrink-0 gap-[2cqw]"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((candidate, cellIndex) => (
                  <CandidateCard
                    key={`${copy}-${rowIndex}-${cellIndex}`}
                    candidate={candidate}
                    look={look}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
