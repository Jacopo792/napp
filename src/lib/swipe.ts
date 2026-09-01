export const SWIPE_ACTION_OFFSET = -104;

/** Trackpads report a positive horizontal wheel delta when natural scrolling
 * moves the content left. Rows travel left to reveal their action, hence the
 * subtraction. Keep the rail short enough to feel attached to the gesture. */
export function nextSwipeOffset(current: number, deltaX: number): number {
  return Math.max(-118, Math.min(0, current - deltaX));
}
