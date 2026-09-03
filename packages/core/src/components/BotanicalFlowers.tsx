/* Four plates, in the idiom the retired sprig established: path data as
   constants, `pathLength="1"` on every stroked path so one dash offset draws a
   petal and a stem alike, and a `--i` on each group deciding when its turn
   comes. They take `currentColor` and the stroke weights already defined for
   `.stem`, `.stalk`, `.blade` and `.vein` — so a flower added here needs no CSS
   of its own.

   A lotus, a narcissus, a lycoris and a peony.

   The box is tall and narrow because of where these are shown: 116vh down the
   right edge of the login window. A plant whose whole drawing sits in the
   middle of a square box arrives there as one enormous flower head filling the
   screen. So the head is small and near the top, and the rest of the box is
   stem and leaves — the composition the sprig had, which is why the sprig read
   as a plate from a herbarium and not as a sticker.

   Each flower carries the thing that identifies it: the lotus its ranked
   petals and seed pod, the narcissus its corona and its papery spathe, the
   lycoris the stamens that reach far past its recurved tepals, the peony the
   sheer count of petals folding into its own centre.

   Hairlines with nothing behind them, which is the whole of what DESIGN.md
   permits: the ban is on invented colour fields, not on drawing. */

import type { CSSProperties } from "react";
import type { PlateFlower } from "@/lib/botanical";

/** Every flower is drawn in this box, so one class can size all four. */
const BOX = "0 0 200 420";

const order = (i: number) => ({ "--i": i }) as CSSProperties;

/** A rank of petals around one point: same shape, same veins, fanned. The
 *  `from` offset keeps the draw order climbing through the whole flower rather
 *  than restarting at each rank. */
function Rank({
  at,
  angles,
  petal,
  veins = [],
  from,
  lift = 0,
}: {
  at: [number, number];
  angles: number[];
  petal: string;
  veins?: string[];
  from: number;
  /** How far up its own axis the petal starts, for a rank set inside another. */
  lift?: number;
}) {
  return (
    <>
      {angles.map((angle, index) => (
        <g
          key={`${angle}-${index}`}
          className="sprig"
          style={order(from + index)}
          transform={`translate(${at[0]} ${at[1]}) rotate(${angle})`}
        >
          <path
            className="blade"
            pathLength="1"
            d={petal}
            transform={lift ? `translate(0 ${-lift})` : undefined}
          />
          {veins.map((vein) => (
            <path key={vein} className="vein" pathLength="1" d={vein} />
          ))}
        </g>
      ))}
    </>
  );
}

/* ── Lotus ───────────────────────────────────────────────────────────────────
   Three ranks and a seed pod. The pod is what makes it a lotus rather than a
   water lily — a flat-topped receptacle with its carpels sunk into it, sitting
   where the petals converge. The pads ride on their own stalks well down the
   stem, drawn with the notch, because a lotus leaf without the split reads as a
   lily pad drawn badly. */
const LOTUS_OUTER = "M0 0 C 15 -13, 21 -36, 0 -55 C -21 -36, -15 -13, 0 0 Z";
const LOTUS_MID = "M0 0 C 12 -11, 17 -29, 0 -45 C -17 -29, -12 -11, 0 0 Z";
const LOTUS_INNER = "M0 0 C 8 -8, 12 -22, 0 -34 C -12 -22, -8 -8, 0 0 Z";

function Lotus() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M104 420 C 96 340, 102 220, 100 122"
      />
      <g className="sprig" style={order(1)}>
        <path className="stalk" pathLength="1" d="M101 352 C 82 348, 58 340, 40 328" />
        <path
          className="blade"
          pathLength="1"
          d="M40 328 C 20 312, 26 284, 52 278 C 80 272, 104 290, 100 312 C 97 328, 66 340, 46 331 L 40 328 Z"
        />
        <path className="vein" pathLength="1" d="M42 327 C 58 318, 79 310, 99 309" />
        <path className="vein" pathLength="1" d="M43 325 C 54 307, 68 293, 86 283" />
        <path className="vein" pathLength="1" d="M44 329 C 62 327, 82 321, 97 315" />
      </g>
      <g className="sprig" style={order(2)}>
        <path className="stalk" pathLength="1" d="M101 262 C 118 258, 136 250, 148 240" />
        <path
          className="blade"
          pathLength="1"
          d="M148 240 C 166 226, 186 234, 184 250 C 172 262, 152 256, 148 240 Z"
        />
        <path className="vein" pathLength="1" d="M150 241 C 162 242, 174 246, 183 251" />
      </g>
      <Rank
        at={[100, 120]}
        angles={[-88, 88]}
        petal={LOTUS_OUTER}
        veins={["M0 -5 L 0 -46"]}
        from={3}
      />
      <Rank
        at={[100, 120]}
        angles={[-58, -29, 0, 29, 58]}
        petal={LOTUS_OUTER}
        veins={["M0 -5 L 0 -46", "M0 -17 C 6 -25, 9 -34, 9 -41", "M0 -17 C -6 -25, -9 -34, -9 -41"]}
        from={5}
      />
      <Rank
        at={[100, 116]}
        angles={[-44, -15, 15, 44]}
        petal={LOTUS_MID}
        veins={["M0 -4 L 0 -38"]}
        from={10}
      />
      <Rank
        at={[100, 112]}
        angles={[-26, 0, 26]}
        petal={LOTUS_INNER}
        veins={["M0 -4 L 0 -29"]}
        from={14}
      />
      {/* The receptacle: flat on top, carpels sunk in it. */}
      <g className="sprig" style={order(17)} transform="translate(100 111)">
        <path
          className="blade"
          pathLength="1"
          d="M-11 -2 C -10 -14, 10 -14, 11 -2 C 11 5, -11 5, -11 -2 Z"
        />
        <path className="vein" pathLength="1" d="M-11 -3 C -5 -7, 5 -7, 11 -3" />
        <path className="vein" pathLength="1" d="M-6 -5 L -6 -10" />
        <path className="vein" pathLength="1" d="M0 -6 L 0 -12" />
        <path className="vein" pathLength="1" d="M6 -5 L 6 -10" />
      </g>
    </>
  );
}

/* ── Narcissus ───────────────────────────────────────────────────────────────
   Six tepals around a trumpet, on a stem with the long strap leaves that come
   straight out of the ground beside it. The corona is what makes it a narcissus
   and not a generic star, so it is drawn three times: the cup, the frill around
   its rim, and the stamens standing inside it. The spathe — the papery sheath
   the bud came out of, still hanging at the neck — is the other half of the
   likeness, and nothing else here has one. */
const NARCISSUS_TEPAL =
  "M0 0 C 12 -10, 17 -24, 12 -36 C 9 -43, 4 -47, 0 -52 C -4 -47, -9 -43, -12 -36 C -17 -24, -12 -10, 0 0 Z";

function Narcissus() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M103 420 C 100 320, 101 190, 100 106"
      />
      {/* Strap leaves, each drawn as a blade with two edges rather than as a
          line: a narcissus leaf is flat and keeled, and one stroke apiece read
          as three parallel rules ruled beside the stem. */}
      <g className="sprig" style={order(1)}>
        <path
          className="blade"
          pathLength="1"
          d="M100 418 C 66 336, 44 232, 40 140 C 50 226, 76 330, 106 416 Z"
        />
        <path className="vein" pathLength="1" d="M99 410 C 70 332, 52 236, 45 156" />
      </g>
      <g className="sprig" style={order(2)}>
        <path
          className="blade"
          pathLength="1"
          d="M104 418 C 140 340, 160 244, 164 168 C 156 246, 132 340, 110 416 Z"
        />
        <path className="vein" pathLength="1" d="M104 410 C 136 340, 154 252, 160 182" />
      </g>
      <g className="sprig" style={order(3)}>
        <path
          className="blade"
          pathLength="1"
          d="M102 418 C 88 344, 80 268, 82 196 C 90 268, 100 344, 106 416 Z"
        />
        <path className="vein" pathLength="1" d="M101 410 C 90 342, 84 272, 85 208" />
      </g>
      {/* The spathe, dried and turned back at the neck. */}
      <g className="sprig" style={order(4)}>
        <path
          className="blade"
          pathLength="1"
          d="M100 110 C 89 112, 81 122, 78 136 C 88 130, 96 121, 100 110 Z"
        />
        <path className="vein" pathLength="1" d="M98 113 C 91 119, 85 127, 81 134" />
      </g>
      <Rank
        at={[100, 98]}
        angles={[0, 60, 120, 180, 240, 300]}
        petal={NARCISSUS_TEPAL}
        veins={["M0 -6 L 0 -40"]}
        from={5}
        lift={9}
      />
      {/* The corona, and it is drawn big: a daffodil is a trumpet standing in
          front of six tepals, and a shy cup makes the whole thing a daisy. The
          rim flares, the frill runs round it, and the anthers show over it. */}
      <g className="sprig" style={order(11)} transform="translate(100 98)">
        <path
          className="blade"
          pathLength="1"
          d="M-9 14 C -16 -2, -18 -12, -15 -17 C -5 -23, 5 -23, 15 -17 C 18 -12, 16 -2, 9 14 C 3 18, -3 18, -9 14 Z"
        />
        <path
          className="blade"
          pathLength="1"
          d="M-15 -17 C -12 -22, -9 -18, -5 -22 C -2 -18, 2 -18, 5 -22 C 9 -18, 12 -22, 15 -17"
        />
        <path className="vein" pathLength="1" d="M-9 12 C -11 2, -12 -8, -11 -16" />
        <path className="vein" pathLength="1" d="M0 15 C 0 4, 0 -8, 0 -18" />
        <path className="vein" pathLength="1" d="M9 12 C 11 2, 12 -8, 11 -16" />
        {/* Three anthers, standing clear of the rim. */}
        <path className="stalk" pathLength="1" d="M-5 -20 C -7 -26, -8 -30, -8 -33" />
        <path className="stalk" pathLength="1" d="M0 -21 C 0 -28, 1 -32, 1 -36" />
        <path className="stalk" pathLength="1" d="M5 -20 C 8 -26, 9 -30, 9 -33" />
      </g>
    </>
  );
}

/* ── Lycoris ─────────────────────────────────────────────────────────────────
   A bare stem: the leaves and the flower of a lycoris never share a season, and
   the empty stalk is the recognisable thing about it. Six tepals curled right
   back on themselves, and stamens that reach far past them — that reach is the
   plant — but only just past them: six tepals and six stamens leaving one
   point is thirteen lines from a single centre, and drawn to their real reach
   the flower stops being a flower and becomes a starburst. The tepals are
   broad and the stamens are short for that reason, not for want of accuracy. */
const LYCORIS_TEPAL =
  "M0 0 C -13 -21, -10 -42, 9 -58 C 17 -64, 27 -60, 24 -51 C 21 -45, 15 -43, 11 -39 C 16 -34, 10 -28, 6 -24 C 10 -19, 4 -15, 2 -10 C 1 -6, 1 -3, 0 0 Z";

function Lycoris() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M104 420 C 106 330, 101 214, 100 148"
      />
      {/* The neck, where six flowers leave one point. */}
      <g className="sprig" style={order(1)}>
        <path className="vein" pathLength="1" d="M94 152 C 98 146, 102 146, 106 152" />
      </g>
      <Rank
        at={[100, 146]}
        angles={[0, 60, 120, 180, 240, 300]}
        petal={LYCORIS_TEPAL}
        veins={["M0 -4 C -9 -22, -7 -38, 8 -51"]}
        from={2}
      />
      {[8, 64, 126, 188, 248, 306].map((angle, index) => (
        <g
          key={angle}
          className="sprig"
          style={order(8 + index)}
          transform={`translate(100 146) rotate(${angle})`}
        >
          <path className="stalk" pathLength="1" d="M0 -10 C 10 -28, 22 -40, 38 -46" />
          {/* The anther at the end, hung across the filament. */}
          <path
            className="vein"
            pathLength="1"
            d="M35 -47 C 40 -50, 44 -48, 45 -44 C 42 -42, 37 -43, 35 -47 Z"
          />
        </g>
      ))}
      {/* The style, longer than every stamen. */}
      <g className="sprig" style={order(14)}>
        <path className="stalk" pathLength="1" d="M100 140 C 114 116, 132 98, 156 88" />
      </g>
    </>
  );
}

/* ── Peony ───────────────────────────────────────────────────────────────────
   The count is the flower. Five guard petals holding the outside, then rank
   after rank folding inward until the centre is petals rather than a middle —
   which is why the innermost rank is drawn small and crowded rather than opened
   out. Notched at the top, the way a peony petal is and a lotus petal is
   not. */
const PEONY_GUARD =
  "M0 0 C 18 -9, 27 -27, 20 -43 C 15 -55, 4 -51, 0 -41 C -4 -51, -15 -55, -20 -43 C -27 -27, -18 -9, 0 0 Z";
const PEONY_MID =
  "M0 0 C 14 -8, 21 -21, 15 -34 C 11 -43, 3 -40, 0 -32 C -3 -40, -11 -43, -15 -34 C -21 -21, -14 -8, 0 0 Z";
const PEONY_INNER =
  "M0 0 C 9 -5, 14 -14, 10 -23 C 7 -30, 2 -28, 0 -22 C -2 -28, -7 -30, -10 -23 C -14 -14, -9 -5, 0 0 Z";

function Peony() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M106 420 C 110 330, 102 210, 100 128"
      />
      {/* Compound leaves: three leaflets on a shared stalk, which is how a
          peony leaf is put together, set alternately up the stem. */}
      <g className="sprig" style={order(1)}>
        <path className="stalk" pathLength="1" d="M105 348 C 124 342, 144 330, 156 314" />
        <path
          className="blade"
          pathLength="1"
          d="M156 314 C 170 300, 188 302, 190 314 C 178 328, 160 328, 156 314 Z"
        />
        <path className="vein" pathLength="1" d="M158 314 C 170 313, 182 314, 189 316" />
        <path
          className="blade"
          pathLength="1"
          d="M136 330 C 144 314, 162 308, 170 316 C 164 330, 146 336, 136 330 Z"
        />
        <path className="vein" pathLength="1" d="M138 329 C 148 324, 159 318, 169 316" />
      </g>
      <g className="sprig" style={order(2)}>
        <path className="stalk" pathLength="1" d="M102 274 C 84 270, 64 260, 52 246" />
        <path
          className="blade"
          pathLength="1"
          d="M52 246 C 36 234, 16 240, 16 252 C 28 264, 48 260, 52 246 Z"
        />
        <path className="vein" pathLength="1" d="M50 247 C 40 248, 28 250, 17 253" />
        <path
          className="blade"
          pathLength="1"
          d="M70 258 C 62 242, 44 236, 36 244 C 42 258, 60 264, 70 258 Z"
        />
        <path className="vein" pathLength="1" d="M68 257 C 58 253, 46 247, 37 245" />
      </g>
      <g className="sprig" style={order(3)}>
        <path className="stalk" pathLength="1" d="M101 210 C 116 206, 132 198, 142 186" />
        <path
          className="blade"
          pathLength="1"
          d="M142 186 C 154 174, 170 176, 172 186 C 162 198, 146 198, 142 186 Z"
        />
        <path className="vein" pathLength="1" d="M144 186 C 154 185, 164 186, 171 188" />
      </g>
      <Rank
        at={[100, 126]}
        angles={[-140, -70, 0, 70, 140]}
        petal={PEONY_GUARD}
        veins={[
          "M0 -5 L 0 -36",
          "M0 -15 C 7 -21, 11 -28, 12 -36",
          "M0 -15 C -7 -21, -11 -28, -12 -36",
        ]}
        from={4}
      />
      <Rank
        at={[100, 122]}
        angles={[-105, -35, 35, 105, 175]}
        petal={PEONY_MID}
        veins={["M0 -4 L 0 -28"]}
        from={9}
      />
      <Rank
        at={[100, 119]}
        angles={[-125, -75, -25, 25, 75, 125]}
        petal={PEONY_MID}
        veins={["M0 -4 L 0 -28"]}
        from={14}
        lift={5}
      />
      <Rank at={[100, 116]} angles={[-60, -20, 20, 60]} petal={PEONY_INNER} from={20} lift={8} />
      <Rank at={[100, 114]} angles={[-30, 10]} petal={PEONY_INNER} from={24} lift={15} />
    </>
  );
}

const FLOWERS: Record<PlateFlower, () => React.JSX.Element> = {
  narcissus: Narcissus,
  lycoris: Lycoris,
  lotus: Lotus,
  peony: Peony,
};

export function BotanicalFlower({
  flower,
  className = "",
}: {
  flower: PlateFlower;
  className?: string;
}) {
  const Drawing = FLOWERS[flower];
  return (
    <svg
      className={`botanical-plate ${className}`}
      viewBox={BOX}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <Drawing />
    </svg>
  );
}
