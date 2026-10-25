import { useCallback, useEffect, type ComponentProps } from "react";
import { usePresence } from "@/components/usePresence";
import { originAtPress } from "@/lib/motion";

export function MenuSurface({
  open,
  onExit,
  ref,
  ...props
}: ComponentProps<"div"> & { open: boolean; onExit?: () => void }) {
  const present = usePresence(open, 150);
  useEffect(() => {
    if (!present) onExit?.();
  }, [present, onExit]);
  /* A menu grows out of the control that opened it — which is wherever the
     pointer last went down, read once as the panel mounts. One placed by its
     caller (at the pointer, for a right-click) keeps the origin it was given. */
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !node.style.transformOrigin) originAtPress(node);
      /* React 19 calls a returned cleanup instead of the ref with null, so
         the caller's own cleanup — a ResizeObserver, for the context menu —
         is handed back rather than dropped. */
      if (typeof ref === "function") {
        const cleanup = ref(node);
        return () => {
          if (typeof cleanup === "function") cleanup();
          else ref(null);
        };
      }
      if (ref) {
        (ref as { current: HTMLDivElement | null }).current = node;
        return () => void ((ref as { current: HTMLDivElement | null }).current = null);
      }
    },
    [ref],
  );
  if (!present) return null;
  return (
    <div
      {...props}
      ref={attach}
      data-menu-exiting={!open || undefined}
      inert={!open}
      aria-hidden={!open || undefined}
    />
  );
}
