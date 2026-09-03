"use client";

import { useEffect, useMemo, useState } from "react";
import { Poppins, Yellowtail } from "next/font/google";
import localFont from "next/font/local";
import FullscreenSwitch from "./fullscreen-switch";
import { supabase } from "../../lib/supabase";

const poppins = Poppins({
  subsets: ["latin"],
  weight: "800",
});

const yellowtail = Yellowtail({
  subsets: ["latin"],
  weight: "400",
});

const styleFormal = localFont({
  src: "../fonts/StyleFormal.ttf",
  display: "swap",
});

type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  position: string | null;
  status: string;
  sort_order: number;
  /*
   * Set from the admin candidate list. Optional so the board
   * keeps working on rows saved before the show_in_visual
   * column existed; a missing value counts as shown.
   */
  show_in_visual?: boolean | null;
};

/* ---------------- ember field ---------------- */

function mulberry32(seed: number) {
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
  seed: number,
  count: number,
  maxR: number
): string {
  const rand = mulberry32(seed);
  const shadows: string[] = [];

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
    useState<Candidate[]>([]);

  const [loading, setLoading] =
    useState(true);

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

  const SET_DURATION = 8000;

  const [currentSet, setCurrentSet] =
    useState(0);

  /* =========================================================
     LOAD CANDIDATES
  ========================================================= */

  async function loadCandidates() {
    /*
     * Selecting every column (instead of naming show_in_visual)
     * keeps the board working even if that column has not been
     * added to the table yet.
     */

    const {
      data,
      error,
    } = await supabase
      .from("candidates")
      .select("*")
      .order("sort_order", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Failed to load candidates:",
        error
      );

      setLoading(false);
      return;
    }

    /*
     * Candidates hidden from the board in the admin panel are
     * dropped here, before the sets are worked out, so a hidden
     * candidate never leaves an empty slot behind.
     */

    const shown = (data ?? []).filter(
      (candidate: Candidate) =>
        candidate.show_in_visual !== false
    );

    setCandidates(shown);
    setLoading(false);
  }

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadCandidates();
  }, []);

  /* =========================================================
     SUPABASE REALTIME
  ========================================================= */

  useEffect(() => {
    const channel = supabase
      .channel("visual-board")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
        },
        (payload) => {
          console.log(
            "Realtime candidate update:",
            payload
          );

          loadCandidates();
        }
      )
      .subscribe((status) => {
        console.log(
          "Realtime status:",
          status
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      className="
        relative
        grid
        h-dvh
        place-items-center
        overflow-hidden
        bg-[#0b0102]
        [background-image:radial-gradient(ellipse_120%_100%_at_50%_42%,#240508_0%,#150304_55%,#0b0102_100%)]
      "
    >

      {/* blurred red swirl */}

      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          -inset-[20%]
          -rotate-12
          blur-[28px]
          [background-image:radial-gradient(ellipse_40%_12%_at_25%_40%,rgba(190,35,30,.24),transparent_70%),radial-gradient(ellipse_32%_9%_at_78%_62%,rgba(210,50,35,.20),transparent_70%),radial-gradient(ellipse_50%_14%_at_60%_25%,rgba(160,25,25,.17),transparent_72%),radial-gradient(ellipse_28%_8%_at_15%_75%,rgba(190,40,30,.15),transparent_70%)]
        "
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

        {/* Logo */}

        <img
          src="/visual/logo.png"
          alt="Hyacinth"
          className="
            mb-[3vh]
            block
            h-auto
            w-[clamp(180px,30vw,380px)]
            drop-shadow-[0_4px_14px_rgba(0,0,0,.55)]
            [@media(max-height:560px)]:w-[clamp(140px,22vw,240px)]
          "
        />

        {/* Title */}

        <div className="flex items-center">

       <h1
  className={`
    ${poppins.className}
    m-0
    w-fit
    max-w-full
    whitespace-nowrap
    text-center
    uppercase
    text-[min(5vw,74px)]
    leading-[1.02]
    tracking-[-0.012em]
    [word-spacing:-0.04em]

    bg-[radial-gradient(ellipse_at_center,#9b722d_0%,#b98d42_24%,#d1a65b_45%,#e1bd78_65%,#f1d795_84%,#f7dfa3_100%)]

    bg-clip-text
    text-transparent

    [filter:drop-shadow(0_2px_1px_rgba(0,0,0,.55))_drop-shadow(0_0_22px_rgba(227,179,91,.40))]

    max-[620px]:whitespace-normal
    max-[620px]:text-[min(9vw,40px)]
    max-[620px]:leading-[1.06]

    [@media(max-height:560px)]:text-[min(4.4vw,44px)]
  `}
>
  Final Interview Applicants
</h1>

        </div>

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
            <div
              className="
                col-span-full
                flex
                min-h-[400px]
                items-center
                justify-center
                bg-[#2e0505]
                text-[#f0d689]
              "
            >
              Loading candidates...
            </div>

          /* EMPTY */

          ) : visibleCandidates.length === 0 ? (
            <div
              className="
                col-span-full
                flex
                min-h-[400px]
                items-center
                justify-center
                bg-[#2e0505]
                text-center
                text-[#f0d689]
              "
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
                  className="
                    flex
                    flex-col
                    bg-[#2e0505]
                  "
                >

                  {/* Photo */}

                  <div
                    className="
                      relative
                      aspect-[11/10]
                      overflow-hidden

                      bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#a51d1d_0%,#6d1010_45%,#2e0505_100%)]
                    "
                  >

                    {candidate.photo_url ? (
                      <div
                        className="
                          absolute
                          inset-0
                          bg-cover
                          bg-center
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

                    <span
                      className={`
                        ${yellowtail.className}

                        flex
                        items-center
                        justify-center

                        text-center
                        leading-none

                        text-[clamp(16px,2vw,28px)]

                        text-[#1a0d02]

                        [-webkit-text-stroke:1px_#1a0d02]
                        [paint-order:stroke_fill]

                        [text-shadow:0_1px_0_rgba(255,246,215,.65)]
                      `}
                    >
                      {candidate.name}
                    </span>

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

        {/* Best of Luck */}

        <div
          className={`
            ${styleFormal.className}
            mt-[1vh]
            text-center
            text-[clamp(24px,5vw,48px)]
            leading-none
            text-[#f0d689]
            drop-shadow-[0_2px_5px_rgba(0,0,0,.65)]
        
          `}
        >
          Best of Luck!
        </div>

      </div>
    </main>
  );
}