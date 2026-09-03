import { useRef, type KeyboardEvent, type PointerEvent } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function PaneResizer({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.documentElement.classList.remove("is-pane-resizing");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 24 : 8;
    onChange(clamp(value + (event.key === "ArrowLeft" ? -step : step), min, max));
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      title="Drag to resize · double-click to reset"
      className="pane-resizer"
      onDoubleClick={() => onChange(clamp(defaultValue, min, max))}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX, width: value };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.classList.add("is-pane-resizing");
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onChange(clamp(drag.current.width + event.clientX - drag.current.x, min, max));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
}
