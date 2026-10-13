import { createContext, useEffect, useState } from "react";

/** The action and dismissal are immediate; only the inert surface stays for
 * its fade. A new opening cancels the timer, so an old exit cannot close it. */
export function usePresence(open: boolean, duration: number) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open || !present) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
    const timer = window.setTimeout(() => setPresent(false), delay);
    return () => window.clearTimeout(timer);
  }, [open, present, duration]);
  return open || present;
}

export const MenuCloseContext = createContext<(() => void) | null>(null);
