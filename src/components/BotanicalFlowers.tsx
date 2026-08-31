/* Three more plates, in the idiom `BotanicalPlate` established: path data as
   constants, `pathLength="1"` on every stroked path so one dash offset draws a
   petal and a stem alike, and a `--i` on each group deciding when its turn
   comes. They take `currentColor` and the stroke weights already defined for
   `.stem`, `.stalk`, `.blade` and `.vein` — so a flower added here needs no CSS
   of its own.

   A narcissus, a lycoris and a lotus. Hairlines with nothing behind them, which
   is the whole of what DESIGN.md permits: the ban is on invented colour fields,
   not on drawing. */

import type { CSSProperties } from "react";
import type { PlateFlower } from "@/lib/botanical";

/** Every flower is drawn in this box, so one class can size all three. */
const BOX = "0 0 200 260";

const order = (i: number) => ({ "--i": i }) as CSSProperties;

/* ── Narcissus ───────────────────────────────────────────────────────────────
   Six tepals around a trumpet, on a stem with two strap leaves. The corona is
   what makes it a narcissus and not a generic star, so it is drawn twice: the
   cup, and the frill around its rim. */
const NARCISSUS_TEPAL = "M0 0 C 11 -9, 17 -27, 0 -42 C -17 -27, -11 -9, 0 0 Z";

function Narcissus() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M100 260 C 98 202, 99 152, 100 120"
      />
      <g className="sprig" style={order(1)}>
        <path className="blade" pathLength="1" d="M100 256 C 76 210, 68 160, 73 108" />
        <path className="vein" pathLength="1" d="M99 250 C 80 208, 74 162, 77 116" />
      </g>
      <g className="sprig" style={order(2)}>
        <path className="blade" pathLength="1" d="M100 256 C 124 214, 134 168, 131 122" />
        <path className="vein" pathLength="1" d="M101 250 C 121 212, 129 170, 127 128" />
      </g>
      {[0, 60, 120, 180, 240, 300].map((angle, index) => (
        <g
          key={angle}
          className="sprig"
          style={order(3 + index)}
          transform={`translate(100 118) rotate(${angle})`}
        >
          <path className="blade" pathLength="1" d={NARCISSUS_TEPAL} transform="translate(0 -12)" />
          <path className="vein" pathLength="1" d="M0 -14 L 0 -50" />
        </g>
      ))}
      <g className="sprig" style={order(9)} transform="translate(100 118)">
        <path
          className="blade"
          pathLength="1"
          d="M-11 0 C -11 -10, 11 -10, 11 0 C 11 9, -11 9, -11 0 Z"
        />
        <path className="vein" pathLength="1" d="M-11 -2 C -6 -7, 6 -7, 11 -2" />
        <path className="vein" pathLength="1" d="M-4 2 L -4 -6" />
        <path className="vein" pathLength="1" d="M4 2 L 4 -6" />
      </g>
    </>
  );
}

/* ── Lycoris ─────────────────────────────────────────────────────────────────
   A bare stem: the leaves and the flower of a lycoris never share a season, and
   the empty stalk is the recognisable thing about it. Six recurved tepals, and
   the stamens that reach well past them — that reach is the plant. */
const LYCORIS_TEPAL = "M0 0 C -7 -17, -4 -35, 13 -47 C 7 -31, 4 -15, 0 0 Z";

function Lycoris() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M100 260 C 101 198, 100 158, 100 130"
      />
      {[0, 60, 120, 180, 240, 300].map((angle, index) => (
        <g
          key={angle}
          className="sprig"
          style={order(1 + index)}
          transform={`translate(100 128) rotate(${angle})`}
        >
          <path className="blade" pathLength="1" d={LYCORIS_TEPAL} />
          <path className="vein" pathLength="1" d="M0 -2 C -4 -16, -1 -30, 10 -41" />
        </g>
      ))}
      {[10, 66, 128, 190, 250, 308].map((angle, index) => (
        <g
          key={angle}
          className="sprig"
          style={order(7 + index)}
          transform={`translate(100 128) rotate(${angle})`}
        >
          <path className="stalk" pathLength="1" d="M0 -6 C 10 -34, 30 -56, 54 -62" />
          <path className="vein" pathLength="1" d="M52 -62 C 57 -64, 60 -63, 62 -60" />
        </g>
      ))}
    </>
  );
}

/* ── Lotus ───────────────────────────────────────────────────────────────────
   Two ranks of petals and one pad. The pad is drawn with its notch, because a
   lotus leaf without the split reads as a lily pad drawn badly. */
const LOTUS_OUTER = "M0 0 C 16 -13, 22 -37, 0 -56 C -22 -37, -16 -13, 0 0 Z";
const LOTUS_INNER = "M0 0 C 10 -11, 14 -29, 0 -44 C -14 -29, -10 -11, 0 0 Z";

function Lotus() {
  return (
    <>
      <path
        className="stem"
        pathLength="1"
        style={order(0)}
        d="M100 260 C 95 212, 97 174, 100 152"
      />
      <g className="sprig" style={order(1)}>
        <path className="stalk" pathLength="1" d="M100 244 C 118 240, 138 236, 152 230" />
        <path
          className="blade"
          pathLength="1"
          d="M152 230 C 168 220, 190 226, 194 240 C 180 251, 154 250, 148 236 L 152 230 Z"
        />
        <path className="vein" pathLength="1" d="M152 232 C 164 234, 178 238, 190 240" />
        <path className="vein" pathLength="1" d="M154 234 C 162 240, 172 245, 184 247" />
      </g>
      {[-58, -29, 0, 29, 58].map((angle, index) => (
        <g
          key={angle}
          className="sprig"
          style={order(2 + index)}
          transform={`translate(100 150) rotate(${angle})`}
        >
          <path className="blade" pathLength="1" d={LOTUS_OUTER} />
          <path className="vein" pathLength="1" d="M0 -4 L 0 -48" />
        </g>
      ))}
      {[-30, 0, 30].map((angle, index) => (
        <g
          key={`inner-${angle}`}
          className="sprig"
          style={order(7 + index)}
          transform={`translate(100 148) rotate(${angle})`}
        >
          <path className="blade" pathLength="1" d={LOTUS_INNER} />
        </g>
      ))}
      <g className="sprig" style={order(10)} transform="translate(100 148)">
        <path
          className="blade"
          pathLength="1"
          d="M-8 -4 C -8 -14, 8 -14, 8 -4 C 8 2, -8 2, -8 -4 Z"
        />
        <path className="vein" pathLength="1" d="M-3 -6 L -3 -11" />
        <path className="vein" pathLength="1" d="M3 -6 L 3 -11" />
      </g>
    </>
  );
}

const FLOWERS: Record<PlateFlower, () => React.JSX.Element> = {
  narcissus: Narcissus,
  lycoris: Lycoris,
  lotus: Lotus,
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
