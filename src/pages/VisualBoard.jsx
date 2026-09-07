import { useEffect, useMemo, useState } from "react";
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
   * At most 4 candidates are shown at one time, and the
   * candidates are spread evenly over the sets so that a set
   * is never left with one or two lonely boxes.
   *
   *   4 candidates  -> one set of 4
   *   6 candidates  -> two sets of 3
   *   8 candidates  -> two sets of 4
   *   9 candidates  -> three sets of 3
   *  12 candidates  -> three sets of 4
   */

  const MAX_CANDIDATES_PER_SET = 4;

  /*
   * Board size relative to the full-width layout.
   *
   * 0.8 = 80%
   */

  const BOARD_SCALE = 0.8;

  /*
   * Width of a single candidate box at full size.
   */

  const FULL_BOX_WIDTH = 295;

  const BOX_WIDTH = Math.round(
    FULL_BOX_WIDTH * BOARD_SCALE
  );

  /*
   * Time before switching to the next set.
   *
   * 8000 = 8 seconds
   */

  const SET_DURATION = 5000;

  const [currentSet, setCurrentSet] =
    useState(0);

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

  /* =========================================================
     BALANCED SET SIZES

     Use as few sets as possible (max 4 per set), then spread
     the candidates evenly so no set is left with a single
     lonely box.

     e.g.  6 -> [3, 3]      8 -> [4, 4]
          10 -> [4, 3, 3]  13 -> [4, 3, 3, 3]
  ========================================================= */

  const setSizes = useMemo(() => {
    const count = candidates.length;

    if (count === 0) {
      return [];
    }

    const setCount = Math.ceil(
      count / MAX_CANDIDATES_PER_SET
    );

    const base = Math.floor(
      count / setCount
    );

    const remainder = count % setCount;

    return Array.from(
      { length: setCount },
      (_, index) =>
        base +
        (index < remainder ? 1 : 0)
    );
  }, [candidates.length]);

  /* =========================================================
     TOTAL NUMBER OF SETS
  ========================================================= */

  const totalSets = Math.max(
    1,
    setSizes.length
  );

  /* =========================================================
     RESET SET WHEN CANDIDATES CHANGE
  ========================================================= */

  useEffect(() => {
    if (currentSet >= totalSets) {
      setCurrentSet(0);
    }
  }, [currentSet, totalSets]);

  /* =========================================================
     AUTOMATIC SET TRANSITION
  ========================================================= */

  useEffect(() => {
    /*
     * Don't rotate if there is only one set.
     */

    if (totalSets <= 1) {
      setCurrentSet(0);
      return;
    }

    const timer =
      window.setInterval(() => {
        setCurrentSet(
          (previousSet) =>
            (previousSet + 1) %
            totalSets
        );
      }, SET_DURATION);

    return () => {
      window.clearInterval(timer);
    };
  }, [totalSets]);

  /* =========================================================
     GET CURRENT SET
  ========================================================= */

  const visibleCandidates =
    useMemo(() => {
      if (setSizes.length === 0) {
        return [];
      }

      const safeSet = Math.min(
        currentSet,
        setSizes.length - 1
      );

      const start = setSizes
        .slice(0, safeSet)
        .reduce(
          (total, size) => total + size,
          0
        );

      return candidates.slice(
        start,
        start + setSizes[safeSet]
      );
    }, [
      candidates,
      currentSet,
      setSizes,
    ]);

  /* =========================================================
     ADAPT NUMBER OF COLUMNS

     One column per visible candidate, so a set of 3 renders
     as 3 boxes side by side and a set of 4 as 4.
  ========================================================= */

  const columns =
    visibleCandidates.length > 0
      ? visibleCandidates.length
      : MAX_CANDIDATES_PER_SET;

  const boardStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    width: `min(${
      BOARD_SCALE * 100
    }%, ${columns * BOX_WIDTH}px)`,
  };

  return (
    <main
      style={{ containerType: "size" }}
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

      {/* =====================================================
          FREE-FORM LAYOUT (logo, text, photos)

          Positioned from admin-configured percentages so the
          /admin/visual-board editor can move and show/hide each
          of these independently of the centered candidate board
          below.
      ===================================================== */}

      {/*
        Shapes set to "Behind" sit here, above the background wash but under
        the candidate board (z-[2]) - the layer decoration belongs on. The
        rest are drawn with the free-form elements below.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
        {layout.shapes
          .filter((shape) => isVisible(shape) && shape.layer !== 'front')
          .map((shape) => (
            <div key={shape.id} className="absolute" style={resolveShapeStyle(shape)} />
          ))}
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3]">
        {/* front shapes paint first here, so text and photos stay on top of them */}
        {layout.shapes
          .filter((shape) => isVisible(shape) && shape.layer === 'front')
          .map((shape) => (
            <div key={shape.id} className="absolute" style={resolveShapeStyle(shape)} />
          ))}

        {isVisible(layout.logo) && (
          <img
            src={layout.logo.url || "/visual/logo.png"}
            alt="Hyacinth"
            style={scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH)}
            className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.55)]"
          />
        )}

        {layout.images
          .filter((image) => isVisible(image))
          .map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt=""
              style={scaledPositionStyle(image, PHOTO_BASE_WIDTH)}
              className="absolute h-auto drop-shadow-[0_4px_14px_rgba(0,0,0,.45)]"
            />
          ))}

        {layout.texts
          .filter((text) => isVisible(text))
          .map((text) => (
            <p
              key={text.id}
              style={{ ...positionStyle(text), ...resolveTextStyle(text) }}
              className="absolute w-max"
            >
              {text.text}
            </p>
          ))}
      </div>

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

      {/* Main content */}

      <div
        className="
          relative
          z-[2]
          grid
          w-full
          place-items-center
          gap-[clamp(6px,1.4vh,18px)]
          px-[clamp(10px,3vw,28px)]
          py-[clamp(10px,2vh,28px)]
        "
      >

        {/* =====================================================
            ANNOUNCEMENTS
        ===================================================== */}

        {announcements.length > 0 && (
          <div
            key={announcements[currentAnnouncement]?.id}
            className={`
              flex
              max-w-[min(88vw,900px)]
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
            <Megaphone
              size={18}
              className="shrink-0"
              aria-hidden="true"
            />

            <p
              className="
                text-[clamp(13px,1.6vw,18px)]
                font-semibold
                leading-snug
              "
            >
              {announcements[currentAnnouncement]?.message}
            </p>
          </div>
        )}

        {/* =====================================================
            CANDIDATE BOARD
        ===================================================== */}

        <div
          key={currentSet}
          style={boardStyle}
          className={`
            grid
            gap-px
            border
            border-[#c9a03c]
            bg-[#c9a03c]
            overflow-hidden
            rounded-[2px]
            animate-[fadeIn_.7s_ease-in-out]
          `}
        >

          {/* LOADING */}

          {loading ? (
            /*
             * Skeleton frames instead of a "Loading..." line: same grid,
             * same photo/name-bar proportions as a real card, so the board
             * keeps its shape and nothing jumps when the data lands.
             */
            Array.from({ length: MAX_CANDIDATES_PER_SET }).map(
              (_, index) => (
                <div
                  key={`skeleton-${index}`}
                  style={{
                    animationDelay: `${index * 0.12}s`,
                  }}
                  className={`
                    flex
                    flex-col
                    ${lightMode ? "bg-[#fdf6f3]" : "bg-[#2e0505]"}
                    animate-[skeleton-in_.5s_ease-out_both]
                  `}
                >

                  {/* Photo placeholder */}

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

                    {/* breathing petal mark */}

                    <div
                      style={{
                        animationDelay: `${index * 0.3}s`,
                      }}
                      className="
                        absolute
                        inset-0
                        flex
                        items-center
                        justify-center
                        animate-[pulse-glow_1.8s_ease-in-out_infinite]
                      "
                    >
                      <img
                        src="/visual/HILLC-Petals.png"
                        alt=""
                        aria-hidden="true"
                        className="
                          w-[38%]
                          max-w-[110px]
                          opacity-30
                          drop-shadow-[0_2px_10px_rgba(0,0,0,.45)]
                        "
                      />
                    </div>

                    {/* gold sheen sweeping across */}

                    <div
                      style={{
                        animationDelay: `${index * 0.18}s`,
                      }}
                      className="
                        absolute
                        inset-y-0
                        -left-1/3
                        w-1/3
                        skew-x-12

                        bg-[linear-gradient(to_right,transparent_0%,rgba(255,229,160,.16)_50%,transparent_100%)]

                        animate-[shimmer_2.2s_ease-in-out_infinite]
                        motion-reduce:hidden
                      "
                    />

                  </div>

                  {/* Name bar placeholder */}

                  <div
                    className="
                      relative
                      flex
                      min-h-[clamp(38px,4vw,58px)]
                      items-center
                      justify-center
                      overflow-hidden

                      bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]

                      px-3
                    "
                  >

                    <div
                      style={{
                        animationDelay: `${index * 0.3}s`,
                        width: `${58 + ((index * 13) % 26)}%`,
                      }}
                      className="
                        h-[38%]
                        rounded-full
                        bg-[#560606]/25
                        animate-[pulse-glow_1.8s_ease-in-out_infinite]
                      "
                    />

                    <div
                      style={{
                        animationDelay: `${index * 0.18}s`,
                      }}
                      className="
                        absolute
                        inset-y-0
                        -left-1/3
                        w-1/3
                        skew-x-12

                        bg-[linear-gradient(to_right,transparent_0%,rgba(255,255,255,.35)_50%,transparent_100%)]

                        animate-[shimmer_2.2s_ease-in-out_infinite]
                        motion-reduce:hidden
                      "
                    />

                  </div>

                </div>
              )
            )

          /* EMPTY */

          ) : visibleCandidates.length === 0 ? (
            <div
              className={`
                col-span-full
                flex
                min-h-[400px]
                items-center
                justify-center
                text-center
                ${
                  lightMode
                    ? "bg-[#fdf6f3] text-[#7a5a12]"
                    : "bg-[#2e0505] text-[#f0d689]"
                }
              `}
            >
              No final interview applicants
              currently listed.
            </div>

          /* CURRENT SET */

          ) : (
            visibleCandidates.map(
              (candidate) => (
                <div
                  key={candidate.id}
                  className={`
                    flex
                    flex-col
                    ${lightMode ? "bg-[#fdf6f3]" : "bg-[#2e0505]"}
                  `}
                >

                  {/* Photo */}

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

                    {candidate.photo_url ? (
                      <div
                        className="
                          absolute
                          inset-0
                          bg-cover
                          bg-top
                          bg-no-repeat
                        "
                        style={{
                          backgroundImage:
                            `url("${candidate.photo_url}")`,
                        }}
                      />
                    ) : (
                      <div
                        className="
                          absolute
                          inset-0
                          flex
                          items-center
                          justify-center
                          text-sm
                          uppercase
                          tracking-widest
                          text-white/40
                        "
                      >
                        {/* No Photo */}
                      </div>
                    )}

                  </div>

                  {/* Name */}

                  <div
                    className="
                      relative
                      flex
                      min-h-[clamp(38px,4vw,58px)]
                      flex-col
                      items-center
                      justify-center

                      bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]

                      px-2
                      py-1
                    "
                  >

                    <AutoFitText
                      className={`
                        font-magneton

                        text-center
                        leading-[1.08]
                        tracking-[0.01em]

                        text-[clamp(16.8px,2.1vw,29.4px)]

                        text-[#560606]

                        [text-shadow:1px_1px_1px_rgba(63,39,10,.3)]
                      `}
                    >
                      {candidate.name}
                    </AutoFitText>

                    {candidate.position && (
                      <span
                        className="
                          mt-1
                          text-[clamp(8px,0.7vw,12px)]
                          font-bold
                          uppercase
                          tracking-wider
                          text-[#2e1604]/80
                        "
                      >

                      </span>
                    )}

                  </div>

                </div>
              )
            )
          )}

        </div>

        {/* Set indicator */}

        {totalSets > 1 && (
          <div
            className="
              text-[11px]
              uppercase
              tracking-[0.18em]
              text-[#f0d689]/50
            "
          >

          </div>
        )}

      </div>
    </main>
  );
}