/* A chat message's bubble, and the small animals that live on its edges.
 *
 * The body is a box like any other, so it grows with the words; the animals
 * are fixed-size drawings pinned to its corners, so a one-word message and a
 * paragraph carry the same cat at the same size. Every drawing is in pixels at
 * 1:1 (the viewBox is the size it is shown at) and shares one hand: flat
 * fills, no outlines, the same dark #2b2420 for eyes, the same blush.
 *
 * Positions are written for a message you sent, which stands at the right. A
 * message from somebody else stands at the left, so its animals are mirrored:
 * the creature that perched on your bubble's outer corner perches on theirs. */
import type { CSSProperties, ReactNode } from "react";
import { chatBubble } from "@/lib/chatBubbles";

const EYE = "#2b2420";
const BLUSH = "#f2897a";

export interface Piece {
  /** Offsets from the body's edges, in px; negative reaches outside. */
  at: { top?: number; bottom?: number; left?: number; right?: number };
  w: number;
  h: number;
  /** Tucked under the body, for parts that grow out from behind it. */
  behind?: boolean;
  art: ReactNode;
}

export interface Dress {
  pieces: Piece[];
  /** Room the pieces need above and below, so they never touch the line
   *  above or the name over the next message. */
  room: { top: number; bottom: number };
}

const eye = (x: number, y: number, r = 1.5) => (
  <>
    <circle cx={x} cy={y} r={r} fill={EYE} />
    <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.36} fill="#fff" />
  </>
);
const blush = (x: number, y: number) => (
  <ellipse cx={x} cy={y} rx={1.7} ry={1} fill={BLUSH} opacity={0.55} />
);

export const DRESSES: Record<string, Dress> = {
  cat: {
    room: { top: 14, bottom: 6 },
    pieces: [
      {
        at: { top: -17, right: 22 },
        w: 34,
        h: 22,
        art: (
          <>
            <path d="M6.6 10 7.8 1.4l6.6 4.8Z" fill="#e9965b" />
            <path d="M27.4 10 26.2 1.4l-6.6 4.8Z" fill="#e9965b" />
            <path d="M8.7 7.4 9.2 3.9l3 2.2Z" fill="#f7b9a6" />
            <path d="M25.3 7.4 24.8 3.9l-3 2.2Z" fill="#f7b9a6" />
            <ellipse cx="17" cy="12" rx="11.2" ry="8.4" fill="#e9965b" />
            <path
              d="M15 4.8v2.1M17 4.4v2.4M19 4.8v2.1"
              stroke="#c9733d"
              strokeWidth=".9"
              strokeLinecap="round"
            />
            {eye(13, 11.6)}
            {eye(21, 11.6)}
            <path d="M16.1 14.1h1.8l-.9 1Z" fill="#b5523b" />
            <path
              d="M15.3 15.5q.85.95 1.7 0 .85.95 1.7 0"
              stroke={EYE}
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
            />
            {blush(10.4, 14.9)}
            {blush(23.6, 14.9)}
            <ellipse cx="7.4" cy="18.8" rx="3.7" ry="2.7" fill="#e9965b" />
            <ellipse cx="26.6" cy="18.8" rx="3.7" ry="2.7" fill="#e9965b" />
            <path
              d="M6.4 19.6v1M8.4 19.6v1M25.6 19.6v1M27.6 19.6v1"
              stroke="#c9733d"
              strokeWidth=".7"
              strokeLinecap="round"
            />
          </>
        ),
      },
      {
        at: { bottom: -9, left: -9 },
        w: 18,
        h: 16,
        behind: true,
        art: (
          <>
            <path
              d="M15 3.5C8.5 4 3.4 7 4 11.6c.4 2.9 3.8 3.1 4.6.9"
              stroke="#e9965b"
              strokeWidth="3.4"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M5.6 9.2l-1.4-.6M7.6 6.6l-1-1.1"
              stroke="#c9733d"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </>
        ),
      },
    ],
  },
  frog: {
    room: { top: 10, bottom: 0 },
    pieces: [
      {
        at: { top: -10, left: 18 },
        w: 30,
        h: 16,
        art: (
          <>
            <circle cx="8" cy="9" r="7" fill="#b4e0a3" />
            <circle cx="22" cy="9" r="7" fill="#b4e0a3" />
            <circle cx="8" cy="8.2" r="4.6" fill="#fff" />
            <circle cx="22" cy="8.2" r="4.6" fill="#fff" />
            {eye(8.7, 8.6, 2.4)}
            {eye(22.7, 8.6, 2.4)}
          </>
        ),
      },
    ],
  },
  bunny: {
    room: { top: 20, bottom: 6 },
    pieces: [
      {
        at: { top: -22, left: 20 },
        w: 26,
        h: 26,
        behind: true,
        art: (
          <>
            <path
              d="M6.4 26C2.8 16.5 3 4.2 7.8 2.6c4.4-1.3 5.3 11.4 4.4 23.4Z"
              fill="#fff"
              stroke="#e7e1d9"
            />
            <path d="M7.6 22c-1.9-6.6-1.6-14.6.6-15.8 1.8-.7 2.4 7.6 1.6 15.8Z" fill="#f6c3d0" />
            <g transform="rotate(16 15 26)">
              <path
                d="M13.4 26c-3.6-9.5-3.4-21.8 1.4-23.4 4.4-1.3 5.3 11.4 4.4 23.4Z"
                fill="#fff"
                stroke="#e7e1d9"
              />
              <path d="M14.6 22c-1.9-6.6-1.6-14.6.6-15.8 1.8-.7 2.4 7.6 1.6 15.8Z" fill="#f6c3d0" />
            </g>
          </>
        ),
      },
      {
        at: { bottom: -5, right: -6 },
        w: 15,
        h: 14,
        art: (
          <>
            <path
              d="M4 11.9C1 11 1.1 7.8 2.7 6.4 1.8 3.8 4.4 1.9 6.5 2.5 8.2.4 11.5 1.7 11.9 4c2.8.4 3.1 3.8 1.5 5.3.6 2.4-2 4.3-4 3.3-2 1.7-4.6 1-5.4-.7Z"
              fill="#fff"
              stroke="#e7e1d9"
              strokeWidth=".8"
            />
            <path d="M5.5 8.8q1.6-2.4 4.3-.6" fill="none" stroke="#efe9e2" strokeLinecap="round" />
          </>
        ),
      },
    ],
  },
  bear: {
    room: { top: 7, bottom: 6 },
    pieces: [
      {
        at: { top: -7, left: 7 },
        w: 16,
        h: 16,
        behind: true,
        art: (
          <>
            <circle cx="8" cy="8" r="7" fill="#c1916a" />
            <circle cx="8" cy="8" r="3.6" fill="#ecd1b4" />
          </>
        ),
      },
      {
        at: { top: -7, right: 7 },
        w: 16,
        h: 16,
        behind: true,
        art: (
          <>
            <circle cx="8" cy="8" r="7" fill="#c1916a" />
            <circle cx="8" cy="8" r="3.6" fill="#ecd1b4" />
          </>
        ),
      },
      {
        at: { bottom: -6, left: 14 },
        w: 34,
        h: 14,
        art: (
          <>
            {[7, 27].map((x) => (
              <g key={x}>
                <path d={`M${x - 5} 1q5-2 10 0v6.2c0 7-10 7-10 0Z`} fill="#c1916a" />
                <ellipse cx={x} cy="8.8" rx="2.8" ry="2.2" fill="#ecd1b4" />
                <circle cx={x - 2.8} cy="5" r="1.1" fill="#ecd1b4" />
                <circle cx={x} cy="4.1" r="1.1" fill="#ecd1b4" />
                <circle cx={x + 2.8} cy="5" r="1.1" fill="#ecd1b4" />
              </g>
            ))}
          </>
        ),
      },
    ],
  },
  penguin: {
    room: { top: 22, bottom: 2 },
    pieces: [
      {
        at: { top: -25, right: 22 },
        w: 22,
        h: 27,
        art: (
          <>
            <ellipse
              cx="3.6"
              cy="16.4"
              rx="2.2"
              ry="5"
              fill="#2e3a55"
              transform="rotate(18 3.6 16.4)"
            />
            <ellipse
              cx="18.4"
              cy="16.4"
              rx="2.2"
              ry="5"
              fill="#2e3a55"
              transform="rotate(-18 18.4 16.4)"
            />
            <ellipse cx="11" cy="15" rx="8.6" ry="10.4" fill="#2e3a55" />
            <ellipse cx="11" cy="17.2" rx="5.8" ry="7.4" fill="#fff" />
            <circle cx="8.3" cy="9.6" r="1.5" fill="#fff" />
            <circle cx="13.7" cy="9.6" r="1.5" fill="#fff" />
            <circle cx="8.5" cy="9.8" r=".8" fill={EYE} />
            <circle cx="13.9" cy="9.8" r=".8" fill={EYE} />
            <path d="M9.8 11.6h2.4L11 13.3Z" fill="#f2a33a" />
            <path d="M5.2 14.2q5.8 2.6 11.6 0v1.9q-5.8 2.6-11.6 0Z" fill="#e0605a" />
            <path d="M14.6 15.6l1.4 4.2 1.6-.6-1-4.2Z" fill="#e0605a" />
            <ellipse cx="8" cy="25.6" rx="2.5" ry="1.2" fill="#f2a33a" />
            <ellipse cx="14" cy="25.6" rx="2.5" ry="1.2" fill="#f2a33a" />
          </>
        ),
      },
    ],
  },
  fox: {
    room: { top: 13, bottom: 7 },
    pieces: [
      {
        at: { top: -14, left: -10 },
        w: 26,
        h: 22,
        art: (
          <>
            <path d="M3.6 10 4.8 1l6.4 5Z" fill="#e8793a" />
            <path d="M22.4 10 21.2 1l-6.4 5Z" fill="#e8793a" />
            <path d="M4.6 3.4 4.8 1l1.9 1.5Z" fill="#3a2318" />
            <path d="M21.4 3.4 21.2 1l-1.9 1.5Z" fill="#3a2318" />
            <path
              d="M2.4 9c3.6-5 17.6-5 21.2 0-1.5 7-6.6 11.5-10.6 12C9 20.5 4 16 2.4 9Z"
              fill="#e8793a"
            />
            <path
              d="M4.4 11c2.6 4.5 6.1 7 8.6 7.5 2.5-.5 6-3 8.6-7.5-3 2-5.5 2.5-8.6 5-3.1-2.5-5.6-3-8.6-5Z"
              fill="#fff6ee"
            />
            <path
              d="M7.4 10.6q1.5-1.6 3 0M15.6 10.6q1.5-1.6 3 0"
              stroke="#3a2318"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
            />
            <ellipse cx="13" cy="17.4" rx="1.4" ry="1" fill="#3a2318" />
          </>
        ),
      },
      {
        at: { bottom: -8, right: -11 },
        w: 24,
        h: 16,
        behind: true,
        art: (
          <>
            <path d="M2 6c6-6 18-6 21 1-3 6-13 7-21 3Z" fill="#e8793a" />
            <path
              d="M18 2.6c3 .8 5 2.4 5 4.4-1 2.5-3 4-5.5 4.8 2-2.8 2.1-6.3.5-9.2Z"
              fill="#fff6ee"
            />
          </>
        ),
      },
    ],
  },
  panda: {
    room: { top: 15, bottom: 6 },
    pieces: [
      {
        at: { top: -18, right: 22 },
        w: 30,
        h: 23,
        art: (
          <>
            <circle cx="7" cy="5" r="4.2" fill="#23211f" />
            <circle cx="23" cy="5" r="4.2" fill="#23211f" />
            <ellipse
              cx="15"
              cy="12.4"
              rx="12"
              ry="9.4"
              fill="#fff"
              stroke="#e7e1d9"
              strokeWidth=".8"
            />
            <ellipse
              cx="10.6"
              cy="12"
              rx="2.8"
              ry="3.6"
              fill="#23211f"
              transform="rotate(-25 10.6 12)"
            />
            <ellipse
              cx="19.4"
              cy="12"
              rx="2.8"
              ry="3.6"
              fill="#23211f"
              transform="rotate(25 19.4 12)"
            />
            <circle cx="11" cy="11.4" r=".95" fill="#fff" />
            <circle cx="19" cy="11.4" r=".95" fill="#fff" />
            <ellipse cx="15" cy="15.4" rx="1.5" ry="1" fill="#23211f" />
            {blush(8, 16.2)}
            {blush(22, 16.2)}
            <ellipse cx="5" cy="19.6" rx="3.6" ry="2.6" fill="#23211f" />
            <ellipse cx="25" cy="19.6" rx="3.6" ry="2.6" fill="#23211f" />
          </>
        ),
      },
      {
        at: { bottom: -7, left: 10 },
        w: 22,
        h: 12,
        art: (
          <>
            <path d="M1 9.5 21 7" stroke="#8bb86d" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8 8.6C9 4 13 2 16 2.6 14.6 6 11.6 8.2 8 8.6Z" fill="#7bb661" />
            <path d="M13 8.2c2-2.6 5.4-3.4 7.4-2.4-1.8 2.2-4.6 3-7.4 2.4Z" fill="#94c77a" />
          </>
        ),
      },
    ],
  },
  duck: {
    room: { top: 18, bottom: 6 },
    pieces: [
      {
        at: { top: -20, right: 24 },
        w: 28,
        h: 22,
        art: (
          <>
            <path d="M2.4 11.4 6.4 14l-3.8 2Z" fill="#f7d046" />
            <ellipse cx="10.6" cy="15.6" rx="8.2" ry="6.4" fill="#f7d046" />
            <circle cx="17.6" cy="8.8" r="6" fill="#f7d046" />
            <ellipse
              cx="10"
              cy="16.4"
              rx="4"
              ry="2.4"
              fill="#ecbd2c"
              transform="rotate(-10 10 16.4)"
            />
            <path
              d="M17 3.8q.9-2.6 2.6-.7"
              stroke="#f7d046"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            {eye(19.4, 8.2, 1.15)}
            <path d="M23 9.4q3.6.2 3.4 1.6-1.8 1-3.6.2Z" fill="#f08a2b" />
            {blush(18.4, 11.2)}
          </>
        ),
      },
      {
        at: { bottom: -6, left: 12 },
        w: 28,
        h: 8,
        art: (
          <path
            d="M1.5 4q3-3 6 0t6 0 6 0 6 0"
            stroke="#7cc3e8"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        ),
      },
    ],
  },
  axolotl: {
    room: { top: 4, bottom: 4 },
    pieces: [-1, 1].map((side) => ({
      at: side < 0 ? { top: -3, left: -10 } : { top: -3, right: -10 },
      w: 14,
      h: 26,
      behind: true,
      art: (
        <g transform={side > 0 ? "translate(14 0) scale(-1 1)" : undefined}>
          <ellipse cx="6" cy="5.4" rx="5.6" ry="2" fill="#ec7fa6" transform="rotate(28 6 5.4)" />
          <ellipse cx="5.4" cy="12.6" rx="5.6" ry="2" fill="#ec7fa6" />
          <ellipse cx="6" cy="19.8" rx="5.6" ry="2" fill="#ec7fa6" transform="rotate(-28 6 19.8)" />
          <circle cx="2.2" cy="3.6" r=".8" fill="#f6b4cc" />
          <circle cx="1.4" cy="12.6" r=".8" fill="#f6b4cc" />
          <circle cx="2.2" cy="21.6" r=".8" fill="#f6b4cc" />
        </g>
      ),
    })),
  },
};

/** How far the animals reach above the body: at least what the dress asks
 *  for, and never less than the tallest piece actually rises — a hand-set
 *  room 2px short let the bunny's ears into the reactions above. */
function roomAbove(dress: Dress): number {
  return Math.max(dress.room.top, ...dress.pieces.map((piece) => -(piece.at.top ?? 0)));
}

/** The band above a dressed bubble, as the name over it needs to know it.
 *  `far` when every animal up there stands away from the name's edge — the
 *  name can then sit beside them in the band instead of over it; `reach` is
 *  how much of the bubble's width they take from that far edge. */
export function dressBand(
  bubble: string | null | undefined,
): { top: number; far: boolean; reach: number } | null {
  const dress = DRESSES[chatBubble(bubble).id];
  if (!dress) return null;
  const rising = dress.pieces.filter((piece) => (piece.at.top ?? 0) < 0);
  return {
    top: roomAbove(dress),
    /* Written for your side, mirrored for theirs: `left` is the far edge
       from the name either way (theirs carry the name at the left, and the
       mirror moves a `left` piece to the right; yours carry the time at the
       right). */
    far: rising.every((piece) => piece.at.left !== undefined && piece.at.left >= 0),
    reach: Math.max(0, ...rising.map((piece) => (piece.at.left ?? 0) + piece.w)),
  };
}

/** As wide as the animal needs, measured from the edge each piece hangs on,
 *  so a short word gets a bubble its own size rather than a fixed floor. */
function dressWidth(dress: Dress | undefined): number {
  if (!dress) return 0;
  /* Pieces hung on opposite edges (a bear's two ears) need room for both. */
  const reach = (side: "left" | "right") =>
    Math.max(
      0,
      ...dress.pieces.map((piece) => {
        const offset = piece.at[side];
        return offset === undefined ? 0 : Math.max(0, offset) + piece.w;
      }),
    );
  const left = reach("left");
  const right = reach("right");
  return left && right ? left + right + 4 : left + right;
}

export function ChatBubble({
  bubble,
  mine,
  bare = false,
  children,
  className = "",
  minWidth,
}: {
  bubble: string | null | undefined;
  mine: boolean;
  /** The colour without the animal: a run of messages carries one animal,
   *  on its last bubble, not one on every line. */
  bare?: boolean;
  children: ReactNode;
  className?: string;
  /** Wide enough for the name sitting beside the animals in their band. */
  minWidth?: number;
}) {
  const style = chatBubble(bubble);
  const dress = bare ? undefined : DRESSES[style.id];
  const body: CSSProperties = style.fill
    ? {
        color: style.ink ?? undefined,
        boxShadow: style.edge ? `inset 0 0 0 1px ${style.edge}` : undefined,
      }
    : {};
  return (
    <span
      className={`chat-bubble ${style.fill ? "is-dressed" : ""} ${className}`}
      data-bubble={style.id}
      style={
        {
          ...(style.fill ? { "--bubble-fill": style.fill } : {}),
          ...(dress
            ? { "--room-top": `${roomAbove(dress)}px`, "--room-bottom": `${dress.room.bottom}px` }
            : {}),
          ...(minWidth || dress ? { minWidth: Math.max(minWidth ?? 0, dressWidth(dress)) } : {}),
        } as CSSProperties
      }
    >
      {/* The plain bubble ends a run with a tail; a dressed one has its
          animal instead, and both at once is one flourish too many. */}
      {!bare && !style.fill && (
        /* Drawn for a bubble standing at the right: x = 18 is the body's
           edge, y = 22 its foot. The tail fills the body's lower corner,
           leaves it along a slow curve and ends in a point 6px out at the
           baseline; its underside lifts back into the bubble's foot, so the
           two read as one outline, as iMessage's do. */
        <svg
          aria-hidden="true"
          className="chat-tail"
          width="24"
          height="22"
          viewBox="0 0 24 22"
          style={mine ? { right: -6 } : { left: -6, transform: "scaleX(-1)" }}
        >
          <path d="M0 0H18V5C18 13 19.4 18.2 23.5 21.4 23.9 21.7 23.7 22.3 23.2 22.3 18.9 22.6 14.8 21.6 11.8 19.4 9.6 21.2 5.6 22 0 22Z" />
        </svg>
      )}
      <span className="chat-bubble-body" style={body}>
        {children}
      </span>
      {dress?.pieces.map((piece, index) => {
        const { left, right, top, bottom } = piece.at;
        return (
          <svg
            key={index}
            aria-hidden="true"
            className={`chat-bubble-piece ${piece.behind ? "is-behind" : ""}`}
            width={piece.w}
            height={piece.h}
            viewBox={`0 0 ${piece.w} ${piece.h}`}
            style={{
              top,
              bottom,
              /* Theirs stand at the left, so the drawing turns to face out. */
              left: mine ? left : right,
              right: mine ? right : left,
              transform: mine ? undefined : "scaleX(-1)",
            }}
          >
            {piece.art}
          </svg>
        );
      })}
    </span>
  );
}
