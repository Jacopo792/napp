/* The curves and durations of styles.css, as numbers.
 *
 * The web reads them as custom properties; the phone animates on its UI thread
 * with Reanimated, which takes a bezier as four numbers and a duration as
 * milliseconds. They are written twice because a stylesheet cannot import a
 * module — and `motionTokens.test.ts` reads styles.css and fails the moment
 * the two disagree. */

export const EASE = {
  standard: [0.32, 0.72, 0, 1],
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.42, 0.64, 1],
  /** Only for a gesture the hand has already let go of. */
  bounce: [0.2, 1.7, 0.5, 1],
  press: [0.4, 0, 0.2, 1],
} as const;

export const DURATION = {
  press: 90,
  fast: 160,
  base: 240,
  swipe: 340,
  slow: 360,
} as const;
