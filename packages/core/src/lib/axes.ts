import { useSyncExternalStore } from "react";

/** The four reading axes. Size, measure and leading are page geometry; weight
 *  is a real variable-font axis on both DM Sans and Bricolage Grotesque, so
 *  moving it re-renders the outlines rather than swapping a static cut. */
export interface Axes {
  size: number;
  measure: number;
  weight: number;
  leading: number;
}

export interface AxisSpec {
  key: keyof Axes;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Printed after the value in the readout — the specimen always shows units. */
  unit: string;
}

export const AXIS_SPECS: AxisSpec[] = [
  { key: "size", label: "Size", min: 13, max: 22, step: 1, unit: "px" },
  { key: "measure", label: "Measure", min: 48, max: 92, step: 2, unit: "ch" },
  { key: "weight", label: "Weight", min: 300, max: 600, step: 5, unit: "" },
  { key: "leading", label: "Leading", min: 1.35, max: 2.0, step: 0.05, unit: "" },
];

export interface Preset {
  id: string;
  name: string;
  role: string;
  axes: Axes;
}

/** Four working set-ups, named for the job rather than the numbers. */
export const PRESETS: Preset[] = [
  {
    id: "compact",
    name: "Compact",
    role: "Dense & fast",
    axes: { size: 14, measure: 62, weight: 430, leading: 1.5 },
  },
  {
    id: "reading",
    name: "Reading",
    role: "Long-form",
    axes: { size: 17, measure: 68, weight: 430, leading: 1.65 },
  },
  {
    id: "study",
    name: "Study",
    role: "Large & airy",
    axes: { size: 18, measure: 74, weight: 430, leading: 1.85 },
  },
  {
    id: "focus",
    name: "Focus",
    role: "Narrow column",
    axes: { size: 17, measure: 52, weight: 455, leading: 1.75 },
  },
];

export const DEFAULT_AXES: Axes = PRESETS[1].axes;

const KEY = "napp:axes:v2";

function read(): Axes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_AXES;
    const parsed = JSON.parse(raw) as Partial<Axes>;
    return {
      size: clamp(parsed.size ?? DEFAULT_AXES.size, 13, 22),
      measure: clamp(parsed.measure ?? DEFAULT_AXES.measure, 48, 92),
      weight: clamp(parsed.weight ?? DEFAULT_AXES.weight, 300, 600),
      leading: clamp(parsed.leading ?? DEFAULT_AXES.leading, 1.35, 2),
    };
  } catch {
    return DEFAULT_AXES;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

let current: Axes = DEFAULT_AXES;
const listeners = new Set<() => void>();

export function applyAxes(a: Axes): void {
  const s = document.documentElement.style;
  s.setProperty("--read-size", `${a.size}px`);
  s.setProperty("--read-measure", `${a.measure}ch`);
  s.setProperty("--read-weight", String(a.weight));
  s.setProperty("--read-leading", String(a.leading));
}

export function initAxes(): void {
  current = read();
  applyAxes(current);
}

export function setAxes(next: Axes): void {
  current = next;
  applyAxes(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode: the axes still hold for this session. */
  }
  listeners.forEach((l) => l());
}

export function setAxis<K extends keyof Axes>(key: K, value: Axes[K]): void {
  setAxes({ ...current, [key]: value });
}

export function currentAxes(): Axes {
  return current;
}

export function subscribeToAxes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The preset whose numbers the current axes match exactly, if any. */
export function matchingPreset(a: Axes): Preset | null {
  return (
    PRESETS.find(
      (p) =>
        p.axes.size === a.size &&
        p.axes.measure === a.measure &&
        p.axes.weight === a.weight &&
        Math.abs(p.axes.leading - a.leading) < 0.001,
    ) ?? null
  );
}

export function useAxes(): Axes {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULT_AXES,
  );
}
