import AutoFitText from "./AutoFitText";

/*
 * The candidate board's contents: an empty-state message, or the looping
 * carousel of candidate cards. Shared between the live board
 * (VisualBoard.jsx) and the admin editor's canvas (AdminVisualBoard.jsx),
 * so what the editor shows inside the candidate box is the real thing at a
 * smaller size rather than a hand-drawn approximation of it. Both sit in a
 * box that marks itself as the container-query basis, so every cqh/cqw
 * measurement here reads against that box in either place.
 *
 * `perRow` is how many candidates sit across one row; a row's height then
 * simply follows its cards' own aspect ratio, so raising or lowering it
 * auto-adjusts card size rather than needing a separate height setting. A
 * row shorter than `perRow` (the last one, when the count doesn't divide
 * evenly) gets its own column count so its cards stretch to fill the row
 * rather than leaving empty cells.
 *
 * The scroll runs at a constant pace regardless of how many candidates
 * there are - more candidates means a longer loop, not a faster one. The
 * card list is rendered twice back to back and animated from 0 to -50%,
 * i.e. exactly one copy's height, so it loops seamlessly no matter how
 * tall a "copy" actually is.
 */

/* Groups a flat list into rows of `size`. */
function chunkIntoRows(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
}

/* One candidate box - photo on top, gold name bar below. The photo keeps a
   fixed aspect ratio rather than filling whatever height its row is given,
   so a card's height simply follows from its width. */
function CandidateCard({ candidate, lightMode }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[3px] border ${
        lightMode ? "border-[#d8ab9c] bg-[#fdf6f3]" : "border-[#c9a03c] bg-[#2e0505]"
      }`}
    >
      <div
        className={`
          relative
          aspect-[11/10]
          overflow-hidden
          ${
            lightMode
              ? "bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#f6ded4_0%,#e8c3b6_45%,#d8ab9c_100%)]"
              : "bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#a51d1d_0%,#6d1010_45%,#2e0505_100%)]"
          }
        `}
      >
        {candidate.photo_url && (
          <div
            className="absolute inset-0 bg-cover bg-top bg-no-repeat"
            style={{ backgroundImage: `url("${candidate.photo_url}")` }}
          />
        )}
      </div>

      <div
        className="
          relative
          flex
          min-h-[clamp(30px,9cqh,55px)]
          flex-col
          items-center
          justify-center
          gap-0.5
          px-2
          py-1

          bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]
        "
      >
        <AutoFitText
          minScale={0.55}
          className="
            font-magneton
            text-center
            leading-[1.1]
            tracking-[0.01em]
            text-[clamp(17px,4.6cqh,28px)]
            text-[#560606]
            [text-shadow:1px_1px_1px_rgba(63,39,10,.3)]
          "
        >
          {candidate.name}
        </AutoFitText>

        {candidate.course && (
          <span
            className="
              truncate
              text-[clamp(8px,1.7cqh,13px)]
              font-bold
              uppercase
              tracking-wider
              text-[#2e1604]/80
            "
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
  lightMode = false,
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
          ${lightMode ? "text-[#7a5a12]" : "text-[#f0d689]"}
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
    <div className="relative h-full w-full overflow-hidden [container-type:size]">
      <div
        className="absolute inset-x-0 top-0 flex flex-col gap-[2cqh]"
        style={{ animation: `carousel-scroll ${duration}s linear infinite` }}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex flex-col gap-[2cqh]">
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
                    lightMode={lightMode}
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
