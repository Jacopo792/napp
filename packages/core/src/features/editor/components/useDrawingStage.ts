import {
  drawKey,
  holdForDesk,
  lendToPhone,
  onPhonePresence,
  phonePresent,
  type DrawTarget,
} from "@/lib/drawHandoff";
import { type Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

/** Said on the editor's element by a host the desk asked to draw a block:
 *  `detail` is the `DrawTarget`, and the block it names opens its stage. */
export const DRAW_HERE = "napp:draw-here";

/** Said on the window while a stage is up, so a host can give it the screen. */
export const STAGE_STATE = "napp:stage";

function usePhonePresent() {
  const [present, setPresent] = useState(phonePresent);
  useEffect(() => onPhonePresence(setPresent), []);
  return present;
}

/** A block's stage: whether it is up, whose hand is on it, and the phone. */
export function useStage(editor: Editor, target: () => DrawTarget | null, reveal: () => void) {
  const present = usePhonePresent();
  const [mode, setMode] = useState<"own" | "lent" | null>(null);
  const [hold, setHold] = useState<ReturnType<typeof holdForDesk> | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => {
    const dom = editor.view.dom;
    const heard = (event: Event) => {
      const asked = (event as CustomEvent<DrawTarget>).detail;
      const mine = targetRef.current();
      if (!mine || drawKey(asked) !== drawKey(mine)) return;
      event.preventDefault();
      revealRef.current();
      setHold(holdForDesk(mine));
      setMode("lent");
    };
    dom.addEventListener(DRAW_HERE, heard);
    return () => dom.removeEventListener(DRAW_HERE, heard);
  }, [editor]);
  const mine = mode === "own" && present ? target() : null;
  return {
    mode,
    open: (next: "own" | "lent") => {
      revealRef.current();
      setMode(next);
    },
    phone: mine ? { present, lend: () => lendToPhone(mine) } : null,
    until: hold?.cancelled,
    close: () => {
      hold?.finish();
      setHold(null);
      setMode(null);
    },
  };
}
