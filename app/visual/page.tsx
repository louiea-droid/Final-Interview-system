import type { CSSProperties } from 'react';
import { Jost, Yellowtail } from 'next/font/google';
import FullscreenSwitch from './fullscreen-switch';

// "Neue Plak" from the prototype is a local font not present in the repo;
// Jost 900 was its declared fallback and is served from Google Fonts.
const jost = Jost({ subsets: ['latin'], weight: '900' });
const yellowtail = Yellowtail({ subsets: ['latin'], weight: '400' });

export const metadata = {
  title: 'Hyacinth — Final Interview Applicants',
};

type Slide = {
  name: string;
  photo: string;
  /** per-photo framing overrides (background-size/position) */
  photoStyle?: CSSProperties;
};

const FRAMES: { a: Slide; b: Slide }[] = [
  {
    a: {
      name: 'Miku T.',
      photo: '/visual/candidate-1a.png',
      photoStyle: { backgroundSize: 'auto 118%', backgroundPosition: 'center bottom' },
    },
    b: { name: 'Nadia S.', photo: 'https://i.pravatar.cc/400?img=26' },
  },
  {
    a: { name: 'Jose C.', photo: 'https://i.pravatar.cc/400?img=12' },
    b: { name: 'Elias M.', photo: 'https://i.pravatar.cc/400?img=5' },
  },
  {
    a: { name: 'Angelica B.', photo: 'https://i.pravatar.cc/400?img=47' },
    b: { name: 'Priya K.', photo: 'https://i.pravatar.cc/400?img=16' },
  },
  {
    a: { name: 'Rafael D.', photo: 'https://i.pravatar.cc/400?img=33' },
    b: { name: 'Tomas L.', photo: 'https://i.pravatar.cc/400?img=60' },
  },
];

/* ---------------- ember field ----------------
 * The prototype shipped ~300KB of pre-generated box-shadow "sparks".
 * Here the same fields are generated deterministically at module load
 * (seeded PRNG, so server and client render identical markup).
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPARK_COLORS = ['224,40,24', '255,80,48', '255,140,60', '255,176,96'];

function sparkField(seed: number, count: number, maxR: number): string {
  const rand = mulberry32(seed);
  const shadows: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * 1600);
    const y = Math.floor(rand() * 1000);
    // radius weighted toward small dots; blur grows with size for a bokeh look
    const r = +(rand() * rand() * maxR).toFixed(1);
    const blur = +((r + 0.5) * (1.5 + rand() * 2)).toFixed(1);
    const color = SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)];
    const alpha = +(0.25 + rand() * 0.55).toFixed(2);
    shadows.push(`${x}px ${y}px ${blur}px ${r}px rgba(${color},${alpha})`);
    // soft halo around some of the brighter dots
    if (rand() < 0.35) {
      shadows.push(
        `${x}px ${y}px ${blur + 6}px ${r + 1.5}px rgba(${color},${+(alpha * 0.35).toFixed(2)})`
      );
    }
  }
  return shadows.join(', ');
}

const SPARK_LAYERS = [
  // far dust: many tiny dots
  { shadow: sparkField(11, 420, 1.2), animation: 'animate-[drift_45s_linear_infinite] opacity-75' },
  // mid embers
  { shadow: sparkField(22, 230, 2.4), animation: 'animate-[drift_28s_linear_infinite] opacity-90' },
  // near embers: larger, brighter
  { shadow: sparkField(33, 120, 4), animation: 'animate-[drift_16s_linear_infinite]' },
  // out-of-focus bokeh: big soft discs
  { shadow: sparkField(44, 36, 8), animation: 'animate-[drift_60s_linear_infinite] opacity-80' },
];

export default function PrototypePage() {
  return (
    <main
      className="relative grid h-dvh place-items-center overflow-hidden bg-[#0b0102]
        [background-image:radial-gradient(ellipse_120%_100%_at_50%_42%,#240508_0%,#150304_55%,#0b0102_100%)]"
    >
      {/* blurred red swirl */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[20%] -rotate-12 blur-[28px]
          [background-image:radial-gradient(ellipse_40%_12%_at_25%_40%,rgba(190,35,30,.24),transparent_70%),radial-gradient(ellipse_32%_9%_at_78%_62%,rgba(210,50,35,.20),transparent_70%),radial-gradient(ellipse_50%_14%_at_60%_25%,rgba(160,25,25,.17),transparent_72%),radial-gradient(ellipse_28%_8%_at_15%_75%,rgba(190,40,30,.15),transparent_70%)]"
      />

      <FullscreenSwitch />

      {/* falling embers: each density layer is doubled 1000px above for a seamless loop */}
      {SPARK_LAYERS.map((layer, i) =>
        [0, -1000].map((top) => (
          <div
            key={`sparks-${i}-${top}`}
            aria-hidden
            className={`pointer-events-none absolute left-1/2 -ml-[800px] h-px w-px rounded-full motion-reduce:animate-none ${layer.animation}`}
            style={{ top, boxShadow: layer.shadow }}
          />
        ))
      )}

      <div className="relative z-[2] grid w-full place-items-center gap-[clamp(6px,1.4vh,18px)] px-[clamp(10px,3vw,28px)] py-[clamp(10px,2vh,28px)]">
        <img
          src="/visual/logo.png"
          alt="Hyacinth"
          className="mb-[5vh] block h-auto w-[clamp(180px,30vw,380px)] drop-shadow-[0_4px_14px_rgba(0,0,0,.55)]
            [@media(max-height:560px)]:w-[clamp(140px,22vw,240px)]"
        />

        <h1
          className={`${jost.className} m-0 w-fit max-w-full whitespace-nowrap text-center uppercase
            text-[min(5vw,74px)] leading-[1.02] tracking-[-0.012em] [word-spacing:-0.04em]
            bg-[linear-gradient(to_bottom,#a9761a_0%,#f0d689_16%,#fff8dc_38%,#edcd6d_49%,#b07f1c_57%,#e7c264_72%,#f3dc95_88%,#b8862b_100%)]
            bg-clip-text text-transparent
            [filter:drop-shadow(0_2px_1px_rgba(0,0,0,.55))_drop-shadow(0_0_14px_rgba(255,170,60,.25))]
            max-[620px]:whitespace-normal max-[620px]:text-[min(9vw,40px)] max-[620px]:leading-[1.06]
            [@media(max-height:560px)]:text-[min(4.4vw,44px)]`}
        >
          Final Interview Applicants
        </h1>

        {/* the gold background shows through the 1px gaps as gridlines */}
        <div
          className="grid w-[min(100%,1180px,calc((90vh-210px)*4.4))] grid-cols-4 gap-px
            border border-[#c9a03c] bg-[#c9a03c]
            max-[900px]:w-[min(100%,calc((90vh-180px)*4.4))]
            max-[620px]:w-[min(100%,calc((78vh-70px)*1.1))] max-[620px]:grid-cols-2"
        >
          {FRAMES.map((frame, i) => {
            // negative delay = head start in the cycle; give the leftmost frame
            // the biggest head start so the swap wave travels left -> right
            const delay = { animationDelay: `-${((FRAMES.length - 1 - i) * 0.18).toFixed(2)}s` };
            return (
              <div key={frame.a.name} className="flex flex-col bg-[#2e0505]">
                <div
                  className="relative aspect-[11/10] overflow-hidden
                    bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,#a51d1d_0%,#6d1010_45%,#2e0505_100%)]"
                >
                  <div
                    className={`absolute inset-0 bg-cover bg-[center_30%] bg-no-repeat will-change-[opacity]
                      animate-[swap-a_9s_infinite] motion-reduce:animate-none`}
                    style={{ backgroundImage: `url("${frame.a.photo}")`, ...frame.a.photoStyle, ...delay }}
                  />
                  <div
                    className={`absolute inset-0 bg-cover bg-[center_30%] bg-no-repeat will-change-[opacity]
                      animate-[swap-b_9s_infinite] motion-reduce:animate-none motion-reduce:opacity-0`}
                    style={{ backgroundImage: `url("${frame.b.photo}")`, ...frame.b.photoStyle, ...delay }}
                  />
                </div>

                <div
                  className="relative h-[clamp(22px,3.2vw,34px)]
                    bg-[linear-gradient(to_bottom,#f2d888_0%,#dbb14b_38%,#b0821c_74%,#8b6615_100%)]"
                >
                  <span
                    className={`${yellowtail.className} absolute inset-0 flex items-center justify-center
                      overflow-hidden whitespace-nowrap px-[6px] pb-[3px] leading-none
                      text-[clamp(13px,1.9vw,24px)] text-[#1a0d02]
                      [-webkit-text-stroke:1px_#1a0d02] [paint-order:stroke_fill]
                      [text-shadow:0_1px_0_rgba(255,246,215,.65)]
                      animate-[name-a_9s_infinite] motion-reduce:animate-none
                      max-[620px]:text-[clamp(11px,3.4vw,18px)]`}
                    style={delay}
                  >
                    {frame.a.name}
                  </span>
                  <span
                    className={`${yellowtail.className} absolute inset-0 flex items-center justify-center
                      overflow-hidden whitespace-nowrap px-[6px] pb-[3px] leading-none
                      text-[clamp(13px,1.9vw,24px)] text-[#1a0d02]
                      [-webkit-text-stroke:1px_#1a0d02] [paint-order:stroke_fill]
                      [text-shadow:0_1px_0_rgba(255,246,215,.65)]
                      animate-[name-b_9s_infinite] motion-reduce:animate-none motion-reduce:opacity-0
                      max-[620px]:text-[clamp(11px,3.4vw,18px)]`}
                    style={delay}
                  >
                    {frame.b.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
