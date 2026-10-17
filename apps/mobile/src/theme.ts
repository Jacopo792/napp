/* The palette and the motion the phone draws with, read from the core as data
   rather than copied: the appearance a new account opens on, and the curves
   and durations of styles.css. */
import { Easing } from "react-native-reanimated";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import { DURATION, EASE } from "@/lib/motionTokens";

/* ponytail: the three appearance colours as they are, until the derivation in
   applyAppearance is a pure function both interfaces read. */
export const { background: ground, foreground: ink, accent } = DEFAULT_APPEARANCE;
export const muted = `${ink}88`;
export const rule = `${ink}22`;
/* The row actions' grounds, `.note-row-action.is-trash` and `.is-archive`. */
export const danger = "#ff453a";
export const shelf = "#a970ff";

const curve = (points: readonly number[]) =>
  Easing.bezier(points[0], points[1], points[2], points[3]);

/** A row let go of: arrives with weight and overshoots, as `--ease-bounce`. */
export const settle = { duration: DURATION.swipe, easing: curve(EASE.bounce) };
/** A surface opening or closing: no overshoot, which on something the size of
 *  the window reads as the window bouncing. */
export const travel = { duration: DURATION.slow, easing: curve(EASE.out) };
export const press = { duration: DURATION.press, easing: curve(EASE.press) };
