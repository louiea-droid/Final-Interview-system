import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";

import FullscreenSwitch from "../components/FullscreenSwitch";
import AutoFitText from "../components/AutoFitText";
import { subscribeAnnouncements, subscribeCandidates } from "../lib/localBackend";
import { isShownOnBoard } from "../lib/candidateVisibility";
import { DEFAULT_LAYOUT, LAYOUT_EVENT, isVisible, loadBoardLayout } from "../lib/boardLayout";
import { resolveTextStyle } from "../lib/textStyle";
import { resolveShapeStyle } from "../lib/shapeStyle";
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from "../lib/boardGeometry";

/* Announcements cycle on their own timer, independent of the candidate sets. */
const ANNOUNCEMENT_DURATION = 7000;

/* ---------------- ember field ---------------- */

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t =
      (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^
      t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPARK_COLORS = [
  "224,40,24",
  "255,80,48",
  "255,140,60",
  "255,176,96",
];

function sparkField(
  seed,
  count,
  maxR
) {
  const rand = mulberry32(seed);
  const shadows = [];

  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * 1600);
    const y = Math.floor(rand() * 1000);

    const r = +(
      rand() * rand() * maxR
    ).toFixed(1);

    const blur = +(
      (r + 0.5) *
      (1.5 + rand() * 2)
    ).toFixed(1);

    const color =
      SPARK_COLORS[
        Math.floor(
          rand() * SPARK_COLORS.length
        )
      ];

    const alpha = +(
      0.25 + rand() * 0.55
    ).toFixed(2);

    shadows.push(
      `${x}px ${y}px ${blur}px ${r}px rgba(${color},${alpha})`
    );

    if (rand() < 0.35) {
      shadows.push(
        `${x}px ${y}px ${blur + 6}px ${
          r + 1.5
        }px rgba(${color},${+(
          alpha * 0.35
        ).toFixed(2)})`
      );
    }
  }

  return shadows.join(", ");
}

const SPARK_LAYERS = [
  {
    shadow: sparkField(11, 420, 1.2),
    animation:
      "animate-[drift_45s_linear_infinite] opacity-75",
  },
  {
    shadow: sparkField(22, 230, 2.4),
    animation:
      "animate-[drift_28s_linear_infinite] opacity-90",
  },
  {
    shadow: sparkField(33, 120, 4),
    animation:
      "animate-[drift_16s_linear_infinite]",
  },
  {
    shadow: sparkField(44, 36, 8),
    animation:
      "animate-[drift_60s_linear_infinite] opacity-80",
  },
];

/* ---------------- Visual Board ---------------- */

export default function DisplayPage() {
  const [candidates, setCandidates] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [lightMode, setLightMode] = useState(false);

  /*
   * The dashboard's small live preview (an <iframe src="/visual?preview=1">)
   * always wants the board's normal dark branding, regardless of whatever
   * light/dark preference the admin has set for their own panel — that
   * preference lives in the same localStorage key this page reads below,
   * so without this guard toggling the admin's panel theme would also
   * flip the actual public board. The real standalone page (opened
   * without ?preview=1) is unaffected and keeps following that setting.
   */
  const [isPreviewEmbed] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1"
  );

  /*
   * =========================================================
   * DISPLAY SETTINGS
   * =========================================================
   *
   * The candidate carousel (right column) shows about 4 cards
   * in its viewport at once, scrolling upward continuously
   * rather than swapping discrete sets.
   */

  const CAROUSEL_VISIBLE_COUNT = 4;

  /* =========================================================
     LOAD CANDIDATES (live)

     subscribeCandidates both delivers the current candidates
     and keeps them in step afterwards, so this one
     subscription covers the initial load and every later
     change - including edits made in another tab.
  ========================================================= */

  useEffect(() => {
    return subscribeCandidates((rows) => {
      /*
       * Candidates hidden from the board in the admin panel are
       * dropped here, before the sets are worked out, so a hidden
       * candidate never leaves an empty slot behind.
       */

      setCandidates(
        rows
          .filter((candidate) => isShownOnBoard(candidate))
          .sort(
            (a, b) =>
              (Number(a.sort_order) || 0) -
              (Number(b.sort_order) || 0)
          )
      );

      setLoading(false);
    });
  }, []);

  /* =========================================================
     LOAD ANNOUNCEMENTS (live)
  ========================================================= */

  const [announcements, setAnnouncements] = useState([]);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(0);

  useEffect(() => {
    return subscribeAnnouncements((rows) => {
      setAnnouncements(
        rows
          .filter((announcement) => announcement.active !== false)
          .sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
          )
      );
    });
  }, []);

  useEffect(() => {
    if (currentAnnouncement >= announcements.length) {
      setCurrentAnnouncement(0);
    }
  }, [currentAnnouncement, announcements.length]);

  useEffect(() => {
    if (announcements.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentAnnouncement(
        (previous) => (previous + 1) % announcements.length
      );
    }, ANNOUNCEMENT_DURATION);

    return () => window.clearInterval(timer);
  }, [announcements.length]);

  /* =========================================================
     LOAD BOARD LAYOUT (live)

     Where the logo, every text block, and any photos or shapes sit
     - and whether each is shown at all - set from /admin/visual-board
     and synced here the same way the theme is: a native 'storage'
     event reaches this page in another tab or in the dashboard's
     preview iframe, and LAYOUT_EVENT covers a listener in the very
     same window.
  ========================================================= */

  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    const load = () => setLayout(loadBoardLayout());

    load();
    window.addEventListener("storage", load);
    window.addEventListener(LAYOUT_EVENT, load);

    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener(LAYOUT_EVENT, load);
    };
  }, []);

  useEffect(() => {
    if (isPreviewEmbed) return;

    const loadTheme = () => {
      const storedSettings = window.localStorage.getItem("interview-board-settings");

      if (!storedSettings) {
        setLightMode(false);
        return;
      }

      try {
        setLightMode(JSON.parse(storedSettings).lightMode === true);
      } catch {
        setLightMode(false);
      }
    };

    loadTheme();
    window.addEventListener("storage", loadTheme);
    window.addEventListener("interview-board-settings-updated", loadTheme);

    return () => {
      window.removeEventListener("storage", loadTheme);
      window.removeEventListener("interview-board-settings-updated", loadTheme);
    };
  }, [isPreviewEmbed]);

  /*
   * =========================================================
   * CAROUSEL SCROLL SPEED
   *
   * A constant pace regardless of how many candidates there are -
   * more candidates means a longer loop, not a faster one. The
   * card list is rendered twice back to back and this animates it
   * from 0 to -50%, i.e. exactly one copy's height, so it loops
   * seamlessly no matter how tall a "copy" actually is.
   * =========================================================
   */

  /* Set per board in the editor; the pace is per card, not per loop. */
  const secondsPerCard = layout.candidates.secondsPerCard ?? 4;

  const carouselDuration = Math.max(
    /* a short list still needs long enough not to be a blur */
    secondsPerCard * 4,
    candidates.length * secondsPerCard
  );

  /*
   * The board is one free-form surface: every entry in layerOrder paints in
   * that order, the candidate board and the announcement strip included.
   * Nothing is pinned to a column any more, so an element sits exactly
   * where the editor put it.
   */

  /* The candidate board, as a positioned and sized box. */
  function renderCandidatesLayer() {
    const box = layout.candidates;
    if (!isVisible(box)) return null;

    return (
      <div
        key="candidates"
        className="absolute [container-type:size]"
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        {renderCandidateCarousel()}
      </div>
    );
  }

  /* The announcement strip, as a positioned box that sizes to its text. */
  function renderAnnouncementsLayer() {
    const box = layout.announcements;
    if (!isVisible(box) || announcements.length === 0) return null;

    return (
      <div
        key="announcements"
        className="absolute flex justify-center"
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          key={announcements[currentAnnouncement]?.id}
          className={`
            flex
            max-w-full
            items-center
            justify-center
            gap-2
            rounded-[2px]
            border
            border-[#c9a03c]
            px-[clamp(12px,2.4vw,22px)]
            py-[clamp(6px,1.2vw,12px)]
            text-center
            animate-[fadeIn_.7s_ease-in-out]
            ${lightMode ? "bg-[#fdf6f3] text-[#7a5a12]" : "bg-[#2e0505] text-[#f0d689]"}
          `}
        >
          <Megaphone size={18} className="shrink-0" aria-hidden="true" />

          <p className="text-[clamp(13px,1.6vw,18px)] font-semibold leading-snug">
            {announcements[currentAnnouncement]?.message}
          </p>
        </div>
      </div>
    );
  }

  /* A soft gold rule - fading at both ends rather than a flat border. */
  function renderDividerLayer(id) {
    const divider = layout.dividers.find((item) => item.id === id);
    if (!divider || !isVisible(divider)) return null;

    const vertical = divider.orientation !== "horizontal";

    return (
      <div
        key={divider.id}
        aria-hidden="true"
        className="absolute"
        style={{
          left: `${divider.x}%`,
          top: `${divider.y}%`,
          width: vertical ? `${divider.thickness}px` : `${divider.length}%`,
          height: vertical ? `${divider.length}%` : `${divider.thickness}px`,
          transform: "translate(-50%, -50%)",
          background: `linear-gradient(to ${
            vertical ? "bottom" : "right"
          }, transparent, rgba(201,160,60,0.55) 18%, rgba(201,160,60,0.75) 50%, rgba(201,160,60,0.55) 82%, transparent)`,
          boxShadow: "0 0 10px rgba(201,160,60,0.28)",
        }}
      />
    );
  }

  function renderLayer(entry) {
    if (entry.kind === "divider") return renderDividerLayer(entry.id);
    if (entry.kind === "candidates") return renderCandidatesLayer();
    if (entry.kind === "announcements") return renderAnnouncementsLayer();

    if (entry.kind === "shape") {
      const shape = layout.shapes.find((item) => item.id === entry.id);
      if (!shape || !isVisible(shape)) return null;
      return <div key={shape.id} className="absolute" style={resolveShapeStyle(shape)} />;
    }

    if (entry.kind === "logo") {
      if (!isVisible(layout.logo)) return null;
      return (
        <img
          key="logo"
          src={layout.logo.url || "/visual/logo.png"}
          alt="Hyacinth"
          style={scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH)}
          className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.55)]"
        />
      );
    }

    if (entry.kind === "image") {
      const image = layout.images.find((item) => item.id === entry.id);
      if (!image || !isVisible(image)) return null;
      return (
        <img
          key={image.id}
          src={image.url}
          alt=""
          style={scaledPositionStyle(image, PHOTO_BASE_WIDTH)}
          className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.45)]"
        />
      );
    }

    if (entry.kind === "text") {
      const text = layout.texts.find((item) => item.id === entry.id);
      if (!text || !isVisible(text)) return null;
      return (
        <p
          key={text.id}
          style={{ ...positionStyle(text), ...resolveTextStyle(text) }}
          className="absolute"
        >
          {text.text}
        </p>
      );
    }

    return null;
  }


  /* Groups a flat list into rows of `size` - unlike a flat grid, a lone
     last candidate is marked to span the full row instead of leaving an
     empty cell next to it. */
  function chunkIntoRows(list, size) {
    const rows = [];
    for (let i = 0; i < list.length; i += size) {
      rows.push(list.slice(i, i + size));
    }
    return rows;
  }

  /* One candidate box for the carousel - photo on top, gold name bar below,
     the board's original card look, just sized to sit two across.
     `full` spans both grid columns, for a lone candidate closing out a row. */
  function renderCandidateCard(candidate, key, full = false) {
    return (
      <div
        key={key}
        className={`flex flex-col overflow-hidden rounded-[3px] ${full ? "col-span-2" : ""} ${lightMode ? "bg-[#fdf6f3]" : "bg-[#2e0505]"}`}
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
          className={`
            relative
            flex
            min-h-[clamp(48px,16cqh,84px)]
            flex-col
            items-center
            justify-center
            gap-0.5
            px-2
            py-1.5

            bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]
          `}
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

  /* The right column's whole candidate board: a loading skeleton, an empty
     message, or the looping carousel - two rows of two copies stacked so
     translateY(-50%) always lands exactly on the seam between them. */
  function renderCandidateCarousel() {
    if (loading) {
      return (
        <div className="grid h-full w-full auto-rows-[minmax(0,1fr)] grid-cols-2 gap-[2cqw] overflow-hidden [container-type:size]">
          {Array.from({ length: CAROUSEL_VISIBLE_COUNT }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              style={{ animationDelay: `${index * 0.12}s` }}
              className={`
                flex
                flex-col
                overflow-hidden
                animate-[skeleton-in_.5s_ease-out_both]
                ${lightMode ? "bg-[#fdf6f3]" : "bg-[#2e0505]"}
              `}
            >
              <div
                className={`
                  relative
                  aspect-[11/10]
                  animate-[pulse-glow_1.8s_ease-in-out_infinite]
                  ${
                    lightMode
                      ? "bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#f6ded4_0%,#e8c3b6_45%,#d8ab9c_100%)]"
                      : "bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#a51d1d_0%,#6d1010_45%,#2e0505_100%)]"
                  }
                `}
                style={{ animationDelay: `${index * 0.3}s` }}
              />
              <div
                className={`
                  min-h-[clamp(48px,16cqh,84px)]
                  bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]
                `}
              />
            </div>
          ))}
        </div>
      );
    }

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

    const rows = chunkIntoRows(candidates, 2);

    return (
      <div className="relative h-full w-full overflow-hidden [container-type:size]">
        <div
          className="absolute inset-x-0 top-0 flex flex-col gap-[2cqh]"
          style={{ animation: `carousel-scroll ${carouselDuration}s linear infinite` }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex flex-col gap-[2cqh]">
              {rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid shrink-0 grid-cols-2 gap-[2cqw]"
                >
                  {row.map((candidate, cellIndex) =>
                    renderCandidateCard(
                      candidate,
                      `${copy}-${rowIndex}-${cellIndex}`,
                      row.length === 1
                    )
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main
      className={`
        relative
        grid
        h-dvh
        place-items-center
        overflow-hidden
        ${lightMode ? "bg-[#f4efed]" : "bg-[#0b0102]"}
      `}
    >

      <video
        className={`
          pointer-events-none
          absolute
          inset-0
          z-0
          h-full
          w-full
          object-cover
          ${lightMode ? "opacity-35" : "opacity-75"}
        `}
        src="/visual/bg.mp4"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />

      <div
        aria-hidden
        className={`
          pointer-events-none
          absolute
          inset-0
          z-[1]
          ${lightMode ? "bg-[#fffaf7]/70" : "bg-black/25"}
        `}
      />

      <FullscreenSwitch />

      {/* Falling embers */}

      {SPARK_LAYERS.map(
        (layer, i) =>
          [0, -1000].map((top) => (
            <div
              key={`sparks-${i}-${top}`}
              aria-hidden
              className={`
                pointer-events-none
                absolute
                left-1/2
                -ml-[800px]
                h-px
                w-px
                rounded-full
                motion-reduce:animate-none
                ${layer.animation}
              `}
              style={{
                top,
                boxShadow:
                  layer.shadow,
              }}
            />
          ))
      )}

      {/*
        The board itself: one full-bleed surface that every element is
        positioned against. It marks itself as the container-query basis,
        so an element's cqw/cqh sizing is relative to the whole board
        rather than to a column of it.
      */}

      <div
        style={{ containerType: "size" }}
        className="absolute inset-0 z-[2]"
      >
        {layout.layerOrder.map(renderLayer)}
      </div>
    </main>
  );
}
