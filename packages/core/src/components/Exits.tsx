import { useState, type ReactNode } from "react";
import { usePresence } from "@/components/usePresence";
import { OVERLAY_OUT } from "@/lib/motion";

/** Keeps a docked column drawn, inert, for its way out. `display: contents`:
 *  the column stays the flex child it was; styles.css animates it by
 *  `data-exiting`. The last open content is what leaves. */
export function Exits({ open, children }: { open: boolean; children: ReactNode }) {
  const [last, setLast] = useState(children);
  if (open && last !== children) setLast(children);
  const present = usePresence(open, OVERLAY_OUT.duration);
  if (!present) return null;
  return (
    <div className="exits" data-exiting={!open || undefined} inert={!open}>
      {open ? children : last}
    </div>
  );
}
