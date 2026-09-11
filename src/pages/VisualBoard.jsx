import { useEffect, useMemo, useState } from "react";

import FullscreenSwitch from "../components/FullscreenSwitch";
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
import { isCarousel, isZigzag, resolveShapeStyle } from "../lib/shapeStyle";
import { resolveAnimationCss } from "../lib/animationStyle";
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from "../lib/boardGeometry";
import PhotoCarousel from "../components/PhotoCarousel";
import PhotoAdjuster from "../components/PhotoAdjuster";
import VideoAdjuster from "../components/VideoAdjuster";
import TextContent from "../components/TextContent";
import CandidateBoard from "../components/CandidateBoard";
import AnnouncementBanner from "../components/AnnouncementBanner";
import ZigzagRule from "../components/ZigzagRule";

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
   * The candidate carousel shows a configurable number of candidates
   * across each row - see `perRow` on layout.candidates - scrolling
   * upward continuously rather than swapping discrete sets. The cards
   * themselves live in components/CandidateBoard.jsx, shared with the
   * editor's canvas.
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

  /*
   * The board holds a 16:9 frame so that what the editor's canvas shows is
   * exactly what paints here. On a screen that is not 16:9 that leaves bars
   * top and bottom (or at the sides), which is the right trade while an
   * admin is designing against the canvas - but wrong on the display itself,
   * where the board should use the whole screen. So the lock is lifted only
   * in fullscreen: windowed, the canvas and the board still agree.
   */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /*
   * A phone held upright is the one shape this board cannot use. It is 16:9,
   * so on a 390x844 screen it collapses to a 390x219 strip with 625px of
   * dead space and type down at 5px - unreadable.
   *
   * Turning it a quarter turn, the way a video player does, lets the same
   * 16:9 frame span the long side of the screen: roughly 1.8x the size with
   * nothing wasted, and one design rather than two. A phone already in
   * landscape fits the board and is left alone; turning the handset also
   * drops this, since the orientation query stops matching.
   */
  const [isPhonePortrait, setIsPhonePortrait] = useState(false);

  useEffect(() => {
    // the dashboard's small embedded preview is its own fixed shape
    if (isPreviewEmbed || typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(orientation: portrait) and (max-width: 820px)");
    const sync = () => setIsPhonePortrait(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [isPreviewEmbed]);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
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
        <CandidateBoard
          candidates={candidates}
          perRow={box.perRow ?? 2}
          secondsPerCard={box.secondsPerCard ?? 4}
          lightMode={lightMode}
        />
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
        <AnnouncementBanner
          key={announcements[currentAnnouncement]?.id}
          className="animate-[fadeIn_.7s_ease-in-out]"
          message={announcements[currentAnnouncement]?.message}
          style={resolveAnnouncementStyle(announcementStyle)}
          showIcon={announcementStyle.showIcon}
          icon={announcementStyle.icon}
          background={announcementStyle.background}
        />
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
          {isZigzag(shape) ? (
            <ZigzagRule
              color={shape.stroke.color}
              width={shape.stroke.width}
              peaks={shape.peaks}
            />
          ) : isCarousel(shape) ? (
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
        The board itself. It marks itself as the container-query basis, so an
        element's cqw/cqh sizing is relative to the whole board rather than
        to a column of it.

        Windowed, it holds a centered 16:9 frame - the same ratio as the
        editor's canvas - so an element sits at the same spot in both, and
        the video shows through the bars on a screen of another shape.
        Fullscreen it takes the whole screen instead, because bars on the
        display are just wasted wall. Every element is positioned as a
        percentage of the board, so they all move with it; on a 16:10 screen
        that means the design stands about 11% taller than the canvas shows
        it, which is the cost of using the full height.
      */}

      <div
        style={{
          containerType: "size",
          ...(isPhonePortrait
            ? {
                /* width and height swap which viewport axis they measure
                   against, so the board's long edge runs down the screen's */
                width: "min(100dvh, 100dvw * 16 / 9)",
                height: "min(100dvw, 100dvh * 9 / 16)",
                /*
                 * Turned sideways the board is wider than the screen, and
                 * `margin: auto` cannot centre a box that overflows its
                 * container - the auto margins resolve to zero and it hangs
                 * off one edge. Pinning the centre and pulling back by half
                 * its own size centres it whatever its size.
                 */
                inset: "auto",
                left: "50%",
                top: "50%",
                margin: 0,
                transform: "translate(-50%, -50%) rotate(90deg)",
              }
            : {
                width: isFullscreen ? "100dvw" : "min(100dvw, 100dvh * 16 / 9)",
                height: isFullscreen ? "100dvh" : "min(100dvh, 100dvw * 9 / 16)",
              }),
        }}
        className="absolute inset-0 z-[2] m-auto overflow-hidden"
      >
        {layout.layerOrder.map(renderLayer)}
      </div>
    </main>
  );
}
