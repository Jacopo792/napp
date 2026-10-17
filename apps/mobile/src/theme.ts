import { useSyncExternalStore } from "react";
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

/* Mono chips — the ink on a quiet disc, colour kept for the bin — filled
   ones, a white glyph on the colour, or tinted ones, the colour on a wash of
   itself, as iOS draws its tinted icons. A fact about this phone's
   look, kept on the device.
   ponytail: localStorage, not the account blob; move it into
   `profile_preferences` when the web grows the same switch. */

export type IconStyle = "mono" | "filled" | "tinted";
const ICON_STYLE = "napp:icon-style";
const listeners = new Set<() => void>();
const readIconStyle = (): IconStyle => {
  const stored = localStorage.getItem(ICON_STYLE);
  return stored === "filled" || stored === "tinted" ? stored : "mono";
};

export function setIconStyle(style: IconStyle) {
  localStorage.setItem(ICON_STYLE, style);
  for (const listener of listeners) listener();
}

export function useIconStyle(): IconStyle {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, readIconStyle);
}
