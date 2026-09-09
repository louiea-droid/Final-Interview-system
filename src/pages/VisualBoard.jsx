import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";

import FullscreenSwitch from "../components/FullscreenSwitch";
import AutoFitText from "../components/AutoFitText";
import { subscribeAnnouncements, subscribeCandidates } from "../lib/firebaseBackend";
import { isShownOnBoard } from "../lib/candidateVisibility";
import { isShownOnBoard as isAnnouncementShownOnBoard } from "../lib/announcementVisibility";
import { DEFAULT_LAYOUT, isVisible, subscribeBoardLayout, subscribeDraftLayout } from "../lib/boardLayout";
import {
  DEFAULT_ANNOUNCEMENT_STYLE,
  resolveAnnouncementStyle,
  subscribeAnnouncementStyle,
} from "../lib/announcementStyle";
import { resolveTextStyle } from "../lib/textStyle";
import { isCarousel, resolveShapeStyle } from "../lib/shapeStyle";
import { resolveAnimationCss } from "../lib/animationStyle";
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from "../lib/boardGeometry";
import PhotoCarousel from "../components/PhotoCarousel";
import PhotoAdjuster from "../components/PhotoAdjuster";
import VideoAdjuster from "../components/VideoAdjuster";
import TextContent from "../components/TextContent";

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

/*
 * `usePublished` (default true) is /visual's normal mode: the published
 * layout, exactly what every viewer sees. The admin-only draft preview at
 * /admin/visual-board/preview renders this same component with it set to
 * false, so "what will this look like" is answered by the very code that
 * decides what it actually looks like - rather than by eyeballing the
 * editor's canvas against a copy of this board that's still showing the
 * last Publish.
 */
export default function DisplayPage({ usePublished = true }) {
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
   * The candidate carousel (right column) shows a configurable number of
   * candidates across each row - see `perRow` on layout.candidates -
   * scrolling upward continuously rather than swapping discrete sets.
   */

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

  const [rawAnnouncements, setRawAnnouncements] = useState([]);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(0);
  const [announcementStyle, setAnnouncementStyle] = useState(DEFAULT_ANNOUNCEMENT_STYLE);

  useEffect(() => {
    return subscribeAnnouncements(setRawAnnouncements);
  }, []);

  /*
   * A scheduled announcement's moment to start showing isn't itself a
   * Firestore change, so nothing would otherwise prompt the board to
   * re-check which announcements currently pass isShownOnBoard.
   */
  const [announcementsNow, setAnnouncementsNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAnnouncementsNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const announcements = useMemo(
    () =>
      rawAnnouncements
        .filter(isAnnouncementShownOnBoard)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawAnnouncements, announcementsNow]
  );

  useEffect(() => {
    return subscribeAnnouncementStyle(setAnnouncementStyle);
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
     and synced here through Firestore's own realtime updates, the
     same way subscribeCandidates/subscribeAnnouncements work above.
  ========================================================= */

  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    return usePublished ? subscribeBoardLayout(setLayout) : subscribeDraftLayout(setLayout);
  }, [usePublished]);

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

  /* Nothing else on the board means anything until the first candidate
     snapshot lands, so the loading state is its own screen - just the
     mark, spinning - rather than a skeleton of a board that isn't
     there yet. */
  if (loading) {
    return (
      <main
        className={`grid h-dvh place-items-center ${
          lightMode ? "bg-[#f4efed]" : "bg-[#0b0102]"
        }`}
      >
        <img
          src="/visual/HILLC-Petals.png"
          alt=""
          className="w-[12vw] max-w-[140px] min-w-[56px] animate-[board-loading-spin_1.6s_linear_infinite] drop-shadow-[0_0_18px_rgba(162,29,27,0.6)] motion-reduce:[animation-duration:2.4s]"
        />
      </main>
    );
  }

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

  /* The announcement strip, as a positioned, resizable box - the bordered
     banner fills it (width and height alike), rather than just hugging its
     own text, so dragging its corner in the editor has a visible effect. */
  function renderAnnouncementsLayer() {
    const box = layout.announcements;
    if (!isVisible(box) || announcements.length === 0) return null;

    return (
      <div
        key="announcements"
        className="absolute flex items-center justify-center"
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          key={announcements[currentAnnouncement]?.id}
          className={`
            flex
            h-full
            w-full
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

          <p className="leading-snug" style={resolveAnnouncementStyle(announcementStyle)}>
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
      return (
        <div key={shape.id} className="absolute" style={resolveShapeStyle(shape)}>
          {isCarousel(shape) ? (
            <PhotoCarousel
              photos={shape.photos}
              direction={shape.animation.direction}
              speed={shape.animation.speed}
              fit={shape.fill.fit}
            />
          ) : (
            <>
              {shape.fill.type === "image" && <PhotoAdjuster fill={shape.fill} />}
              {shape.fill.type === "video" && <VideoAdjuster fill={shape.fill} />}
            </>
          )}
        </div>
      );
    }

    if (entry.kind === "logo") {
      if (!isVisible(layout.logo)) return null;
      return (
        <img
          key="logo"
          src={layout.logo.url || "/visual/logo.png"}
          alt="Hyacinth"
          style={{
            ...scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH),
            ...resolveAnimationCss(layout.logo.animation),
          }}
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
          style={{
            ...scaledPositionStyle(image, PHOTO_BASE_WIDTH),
            ...resolveAnimationCss(image.animation),
          }}
          className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.45)]"
        />
      );
    }

    if (entry.kind === "video") {
      const video = layout.videos.find((item) => item.id === entry.id);
      if (!video || !isVisible(video)) return null;
      return (
        <video
          key={video.id}
          src={video.url}
          style={{
            ...scaledPositionStyle(video, PHOTO_BASE_WIDTH),
            ...resolveAnimationCss(video.animation),
          }}
          className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.45)]"
          autoPlay
          loop
          muted
          playsInline
        />
      );
    }

    if (entry.kind === "text") {
      const text = layout.texts.find((item) => item.id === entry.id);
      if (!text || !isVisible(text)) return null;
      return (
        <p
          key={text.id}
          style={{
            ...positionStyle(text),
            ...resolveTextStyle(text),
            ...resolveAnimationCss(text.animation),
          }}
          className="absolute"
        >
          <TextContent text={text} />
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

  /* One candidate box for the carousel - photo on top, gold name bar below.
     The photo keeps a fixed aspect ratio rather than filling whatever
     height its row is given, so a card's height simply follows from its
     width - which is what makes `perRow` (below) "auto adjust" card size
     just by changing how many sit across a row, with no separate height
     setting to keep in sync. */
  function renderCandidateCard(candidate, key) {
    return (
      <div
        key={key}
        className={`flex flex-col overflow-hidden rounded-[3px] border ${lightMode ? "border-[#d8ab9c] bg-[#fdf6f3]" : "border-[#c9a03c] bg-[#2e0505]"}`}
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
            min-h-[clamp(30px,9cqh,55px)]
            flex-col
            items-center
            justify-center
            gap-0.5
            px-2
            py-1

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
     message, or the looping carousel - two copies of the candidate list
     stacked so translateY(-50%) always lands exactly on the seam between
     them, regardless of how tall each copy actually is.
     `perRow` (set from the editor's Candidate Board panel, 2 by default)
     is how many candidates sit across one row; a row's height then simply
     follows its cards' own aspect ratio, so raising or lowering `perRow`
     auto-adjusts card size to fit that many across instead of requiring a
     separate height setting to keep in sync. A row shorter than `perRow`
     (the last one, when the count doesn't divide evenly) gets its own
     column count so its cards stretch to fill the row rather than leaving
     empty cells. */
  function renderCandidateCarousel() {
    const perRow = layout.candidates.perRow ?? 2;

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

    const rows = chunkIntoRows(candidates, perRow);

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
                  className="grid shrink-0 gap-[2cqw]"
                  style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                >
                  {row.map((candidate, cellIndex) =>
                    renderCandidateCard(candidate, `${copy}-${rowIndex}-${cellIndex}`)
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

      {/*
        A permanent, impossible-to-miss label while this is the draft
        preview - it renders through the exact same code as the real
        board, so nothing else on screen marks it as not-yet-published.
      */}
      {!usePublished && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex justify-center"
          aria-hidden="true"
        >
          <span className="mt-2 rounded-full border border-[#f4ca5d]/50 bg-black/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#f4ca5d]">
            Draft preview · not yet published
          </span>
        </div>
      )}

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
        The board itself: a centered 16:9 frame, letterboxed against
        whatever the screen's actual ratio is, with the video showing
        through the bars. It marks itself as the container-query basis, so
        an element's cqw/cqh sizing is relative to the whole board rather
        than to a column of it - and, being locked to the same 16:9 ratio
        as the editor's canvas, an element sits at the same spot here as it
        does in the preview, regardless of the display's own aspect ratio.
      */}

      <div
        style={{
          containerType: "size",
          width: "min(100dvw, 100dvh * 16 / 9)",
          height: "min(100dvh, 100dvw * 9 / 16)",
        }}
        className="absolute inset-0 z-[2] m-auto overflow-hidden"
      >
        {layout.layerOrder.map(renderLayer)}
      </div>
    </main>
  );
}
