import { useEffect, type ComponentProps } from "react";
import { usePresence } from "@/components/usePresence";

export function MenuSurface({
  open,
  onExit,
  ...props
}: ComponentProps<"div"> & { open: boolean; onExit?: () => void }) {
  const present = usePresence(open, 80);
  useEffect(() => {
    if (!present) onExit?.();
  }, [present, onExit]);
  if (!present) return null;
  return (
    <div
      {...props}
      data-menu-exiting={!open || undefined}
      inert={!open}
      aria-hidden={!open || undefined}
    />
  );
}
