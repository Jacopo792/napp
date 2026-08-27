import { useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import {
  AXIS_SPECS,
  PRESETS,
  matchingPreset,
  setAxes,
  setAxis,
  useAxes,
  type Axes,
} from "@/lib/axes";

function format(key: keyof Axes, v: number, unit: string): string {
  const n = key === "leading" ? v.toFixed(2) : String(v);
  return unit ? `${n}${unit}` : n;
}

/** One axis: name and value on a baseline, the track under them. */
function AxisSlider({ spec, axes }: { spec: (typeof AXIS_SPECS)[number]; axes: Axes }) {
  const value = axes[spec.key];
  const pct = ((value - spec.min) / (spec.max - spec.min)) * 100;

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="field-row">
        <span className="label text-ink-3">{spec.label}</span>
        <span className="readout text-ink">{format(spec.key, value, spec.unit)}</span>
      </span>
      <input
        type="range"
        className="axis-range"
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${spec.label}, ${format(spec.key, value, spec.unit)}`}
        onChange={(e) => setAxis(spec.key, Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="field-row">
        <span className="readout text-[9px] text-ink-4">{spec.min}</span>
        <span className="readout text-[9px] text-ink-4">{spec.max}</span>
      </span>
    </label>
  );
}

interface Props {
  /** The save readout — the one state this bar always shows, open or shut. */
  children: ReactNode;
}

export function AxisBar({ children }: Props) {
  const axes = useAxes();
  const [open, setOpen] = useState(false);
  const preset = matchingPreset(axes);

  return (
    <div className="soft-pane mx-3 mb-3 shrink-0 bg-paper">
      {open && (
        <div className="flex items-start gap-8 border-b border-rule-soft px-5 pt-4 pb-4">
          <div className="flex min-w-0 flex-[3] items-start gap-6">
            {AXIS_SPECS.map((spec) => (
              <AxisSlider key={spec.key} spec={spec} axes={axes} />
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-1.5">
            <span className="label text-ink-3">Presets</span>
            <div className="flex gap-1.5">
              {PRESETS.map((p) => {
                const on = preset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setAxes(p.axes)}
                    aria-pressed={on}
                    className={`rounded-lg px-3 py-1.5 text-left transition-colors ${
                      on
                        ? "border border-accent bg-accent-wash"
                        : "border border-rule bg-page hover:border-ink-3"
                    }`}
                  >
                    <span
                      className={`block readout text-[11px] ${on ? "text-accent" : "text-ink"}`}
                    >
                      {p.name}
                    </span>
                    <span className="block readout text-[9px] text-ink-3">{p.role}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex h-10 items-center gap-3 px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="label icon-button flex items-center gap-1.5 px-2 py-1 text-ink-3"
        >
          Axes
          <ChevronUp
            size={11}
            strokeWidth={2}
            className={`transition-transform duration-200 ${open ? "" : "rotate-180"}`}
          />
        </button>

        <span className="readout text-ink-3">
          {preset ? preset.name : "Custom"}
          <span className="text-ink-4"> · </span>
          {axes.size}
          <span className="text-ink-4">/</span>
          {axes.measure}
          <span className="text-ink-4">/</span>
          {axes.weight}
        </span>

        <span className="ml-auto">{children}</span>
      </div>
    </div>
  );
}
