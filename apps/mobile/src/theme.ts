/* The motion the phone animates with, read from the core as data — the curves
   and durations of styles.css — and the two row-action grounds the stylesheet
   paints `.note-row-action.is-trash` and `.is-archive` with. Everything else
   about colour is the reader's appearance, through `usePalette`. */
import { Easing } from "react-native-reanimated";
import { DURATION, EASE } from "@/lib/motionTokens";

export const trashGround = "#ff453a";
export const shelfGround = "#a970ff";

const curve = (points: readonly number[]) =>
  Easing.bezier(points[0], points[1], points[2], points[3]);

/** A row let go of: arrives with weight and overshoots, as `--ease-bounce`. */
export const settle = { duration: DURATION.swipe, easing: curve(EASE.bounce) };
/** Something leaving or arriving, with no overshoot. */
export const travel = { duration: DURATION.slow, easing: curve(EASE.out) };

/** A spring with no overshoot: whatever the finger let go of arrives and
 *  stops, the way Revolut's surfaces do. Physical rather than a curve, so an
 *  animation interrupted halfway carries its speed into the next one. */
export const glide = { dampingRatio: 1, duration: 420 } as const;
/** The same spring, quicker: a press giving back. */
export const release = { dampingRatio: 1, duration: 260 } as const;
