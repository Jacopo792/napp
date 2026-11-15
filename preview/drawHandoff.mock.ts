/* A phone that is always listening (to a desk), so the preview shows Draw on iPhone and
   the stage's waiting state. It "draws" for four seconds and puts the pen down. */
export type DrawTarget = { noteId: string } & ({ objectId: string } | { board: number });
export const drawKey = (target: DrawTarget) =>
  `${target.noteId}:${"objectId" in target ? target.objectId : `board${target.board}`}`;
export const attachDrawing = () => () => {};
/* The phone's own page is not a desk: it never offers the phone to itself. */
export const phonePresent = () =>
  typeof window !== "undefined" && !("ReactNativeWebView" in window);
export const onPhonePresence = () => () => {};
export const onDrawAsk = () => () => {};
export function lendToPhone(): { done: Promise<void>; cancel: () => void } {
  let timer = 0;
  const done = new Promise<void>((resolve) => {
    timer = window.setTimeout(resolve, 4000);
  });
  return { done, cancel: () => window.clearTimeout(timer) };
}
export function holdForDesk() {
  return { cancelled: new Promise<void>(() => {}), finish: () => {} };
}
