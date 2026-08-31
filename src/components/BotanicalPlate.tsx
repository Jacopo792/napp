/* An engraved sprig, drawn rather than photographed and drawn here rather than
   fetched: it is one file of path data, it takes the reader's ink colour like
   everything else, and it is the only picture in an app that otherwise shows
   none of its own. A plate, not a wash — DESIGN.md bans the invented gradient
   field, and this is the opposite of one: hairlines with nothing behind them.

   Every stroked path declares `pathLength="1"`, so the door's one authored
   moment — the stem growing, then leaf after leaf — is a single dash offset
   from 1 to 0 whatever a path's real length is. `stroke-dasharray` and
   `stroke-dashoffset` inherit, so a `<use>` carries the animation into the
   shape it references. */

const LEAF_A = "M0 0 C 26 -30, 74 -38, 116 -14 C 78 20, 28 24, 0 0 Z";
const LEAF_B = "M0 0 C 22 -22, 62 -32, 98 -20 C 66 8, 24 20, 0 0 Z";

/** Leaves down one side of the stem: where it joins, how the stalk runs out to
 *  the blade, and how far the blade has turned toward the light. */
const LEAVES = [
  { at: [348, 758], stalk: "C 14 -6, 26 -10, 38 -12", tip: [36, -12], turn: -14, size: 1, leaf: 0 },
  {
    at: [324, 646],
    stalk: "C 13 -8, 24 -13, 34 -17",
    tip: [32, -17],
    turn: -24,
    size: 0.94,
    leaf: 1,
  },
  {
    at: [304, 540],
    stalk: "C 12 -9, 21 -15, 30 -21",
    tip: [28, -21],
    turn: -33,
    size: 0.9,
    leaf: 0,
  },
  {
    at: [290, 434],
    stalk: "C 10 -10, 18 -17, 25 -24",
    tip: [23, -24],
    turn: -42,
    size: 0.78,
    leaf: 1,
  },
  {
    at: [280, 330],
    stalk: "C 8 -10, 14 -18, 19 -25",
    tip: [18, -25],
    turn: -52,
    size: 0.66,
    leaf: 0,
  },
  {
    at: [282, 232],
    stalk: "C 6 -9, 10 -16, 13 -22",
    tip: [12, -22],
    turn: -62,
    size: 0.5,
    leaf: 1,
  },
  {
    at: [336, 700],
    stalk: "C -13 -7, -24 -12, -35 -15",
    tip: [-33, -15],
    turn: 194,
    size: 1,
    leaf: 1,
  },
  {
    at: [314, 592],
    stalk: "C -12 -9, -22 -15, -31 -20",
    tip: [-29, -20],
    turn: 202,
    size: 0.95,
    leaf: 0,
  },
  {
    at: [296, 486],
    stalk: "C -10 -10, -19 -17, -26 -23",
    tip: [-24, -23],
    turn: 212,
    size: 0.86,
    leaf: 1,
  },
  {
    at: [284, 382],
    stalk: "C -9 -10, -16 -18, -21 -25",
    tip: [-20, -25],
    turn: 222,
    size: 0.72,
    leaf: 0,
  },
  {
    at: [279, 280],
    stalk: "C -6 -10, -11 -17, -15 -23",
    tip: [-14, -23],
    turn: 234,
    size: 0.56,
    leaf: 1,
  },
];

/* Drawn in the order a stem grows, so the entrance climbs rather than flickers
   on at random. */
const ORDER = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5];

export function BotanicalPlate({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`botanical-plate ${className}`}
      viewBox="0 0 560 820"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <g id="plate-leaf-a">
          <path className="blade" pathLength="1" d={LEAF_A} />
          <path className="vein" pathLength="1" d="M2 -1 C 36 -8, 76 -13, 114 -14" />
          <path className="vein" pathLength="1" d="M26 -8 C 34 -16, 44 -21, 56 -23" />
          <path className="vein" pathLength="1" d="M50 -11 C 58 -18, 68 -22, 80 -22" />
          <path className="vein" pathLength="1" d="M28 -5 C 34 4, 42 9, 52 12" />
          <path className="vein" pathLength="1" d="M54 -9 C 60 -2, 70 4, 82 5" />
        </g>
        <g id="plate-leaf-b">
          <path className="blade" pathLength="1" d={LEAF_B} />
          <path className="vein" pathLength="1" d="M2 -1 C 32 -9, 66 -16, 96 -20" />
          <path className="vein" pathLength="1" d="M24 -8 C 32 -15, 42 -20, 52 -23" />
          <path className="vein" pathLength="1" d="M26 -4 C 32 3, 40 7, 50 8" />
        </g>
        <g id="plate-bud">
          <path
            className="blade"
            pathLength="1"
            d="M0 0 C 13 -14, 14 -35, 0 -48 C -14 -35, -13 -14, 0 0 Z"
          />
          <path className="vein" pathLength="1" d="M0 -4 L 0 -40" />
        </g>
      </defs>

      <path
        className="stem"
        pathLength="1"
        style={{ "--i": 0 } as React.CSSProperties}
        d="M356 820 C 322 672, 292 522, 280 372 C 272 250, 288 158, 322 78"
      />

      {LEAVES.map((leaf, index) => (
        <g
          key={index}
          className="sprig"
          style={{ "--i": ORDER.indexOf(index) + 1 } as React.CSSProperties}
          transform={`translate(${leaf.at[0]} ${leaf.at[1]})`}
        >
          <path className="stalk" pathLength="1" d={`M0 0 ${leaf.stalk}`} />
          <g
            transform={`translate(${leaf.tip[0]} ${leaf.tip[1]}) rotate(${leaf.turn}) scale(${leaf.size})`}
          >
            <use href={leaf.leaf === 0 ? "#plate-leaf-a" : "#plate-leaf-b"} />
          </g>
        </g>
      ))}

      <g
        className="sprig"
        style={{ "--i": LEAVES.length + 1 } as React.CSSProperties}
        transform="translate(322 78)"
      >
        <use href="#plate-bud" transform="rotate(8)" />
        <path className="stalk" pathLength="1" d="M-2 6 C -14 0, -24 -8, -30 -18" />
        <g transform="translate(-30 -18) rotate(-16) scale(.76)">
          <use href="#plate-bud" />
        </g>
        <path className="stalk" pathLength="1" d="M2 10 C 14 6, 24 0, 31 -8" />
        <g transform="translate(31 -8) rotate(26) scale(.62)">
          <use href="#plate-bud" />
        </g>
      </g>
    </svg>
  );
}
