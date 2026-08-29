import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "dark" | "light";

export interface Appearance {
  theme: ThemeMode;
  accent: string;
  background: string;
  foreground: string;
  contrast: number;
  translucentSidebar: boolean;
  wallpaper: boolean;
  wallpaperDim: number;
  wallpaperBlur: number;
  wallpaperFit: "cover" | "contain";
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "#f5f5f5",
  background: "#292929",
  foreground: "#e8e8e8",
  contrast: 50,
  translucentSidebar: false,
  wallpaper: false,
  wallpaperDim: 42,
  wallpaperBlur: 0,
  wallpaperFit: "cover",
};

export const APPEARANCE_PRESETS = [
  {
    id: "graphite",
    name: "Graphite",
    theme: "dark" as const,
    accent: "#f5f5f5",
    background: "#292929",
    foreground: "#e8e8e8",
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: "dark" as const,
    accent: "#75c7ff",
    background: "#18232e",
    foreground: "#edf5fa",
  },
  {
    id: "aubergine",
    name: "Aubergine",
    theme: "dark" as const,
    accent: "#d9abff",
    background: "#2a2230",
    foreground: "#f3edf5",
  },
  {
    id: "paper",
    name: "Paper",
    theme: "light" as const,
    accent: "#28708c",
    background: "#f7f3ea",
    foreground: "#29251f",
  },
] as const;

const LIGHT_DEFAULTS = {
  accent: "#1677c8",
  background: "#fbfaf7",
  foreground: "#242424",
};

const KEY = "napp:appearance:v1";
const DB = "napp:appearance";
const STORE = "assets";
const WALLPAPER = "wallpaper";
const listeners = new Set<() => void>();
let current = DEFAULT_APPEARANCE;
let wallpaperUrl = "";
let media: MediaQueryList | null = null;

function validHex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function read(): Appearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>;
    const theme: ThemeMode = ["system", "dark", "light"].includes(parsed.theme ?? "")
      ? (parsed.theme as ThemeMode)
      : DEFAULT_APPEARANCE.theme;
    return {
      theme,
      accent: validHex(parsed.accent, DEFAULT_APPEARANCE.accent),
      background: validHex(parsed.background, DEFAULT_APPEARANCE.background),
      foreground: validHex(parsed.foreground, DEFAULT_APPEARANCE.foreground),
      contrast: clamp(parsed.contrast, 20, 80, DEFAULT_APPEARANCE.contrast),
      translucentSidebar: Boolean(parsed.translucentSidebar),
      wallpaper: Boolean(parsed.wallpaper),
      wallpaperDim: clamp(parsed.wallpaperDim, 0, 80, DEFAULT_APPEARANCE.wallpaperDim),
      wallpaperBlur: clamp(parsed.wallpaperBlur, 0, 20, DEFAULT_APPEARANCE.wallpaperBlur),
      wallpaperFit: parsed.wallpaperFit === "contain" ? "contain" : "cover",
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function darkMode(config = current): boolean {
  return config.theme === "dark" || (config.theme === "system" && (media?.matches ?? true));
}

function mix(hex: string, amount: number, toward: "black" | "white"): string {
  const target = toward === "black" ? 0 : 255;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.round(channel + (target - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function applyAppearance(config = current): void {
  const root = document.documentElement;
  const dark = darkMode(config);
  const background = config.background;
  const foreground = config.foreground;
  const contrastShift = (config.contrast - 50) / 100;

  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.setProperty("--page", background);
  root.style.setProperty(
    "--paper",
    mix(background, dark ? 0.11 + contrastShift * 0.08 : 0.035, dark ? "white" : "black"),
  );
  root.style.setProperty(
    "--surface",
    mix(background, dark ? 0.17 + contrastShift * 0.12 : 0.045, dark ? "black" : "white"),
  );
  root.style.setProperty("--ink", foreground);
  root.style.setProperty("--ink-2", mix(foreground, dark ? 0.16 : 0.22, dark ? "black" : "white"));
  root.style.setProperty("--ink-3", mix(foreground, dark ? 0.38 : 0.42, dark ? "black" : "white"));
  root.style.setProperty("--ink-4", mix(foreground, dark ? 0.52 : 0.54, dark ? "black" : "white"));
  root.style.setProperty(
    "--rule",
    mix(
      background,
      dark ? 0.1 + config.contrast / 500 : 0.09 + config.contrast / 600,
      dark ? "white" : "black",
    ),
  );
  root.style.setProperty(
    "--rule-soft",
    mix(
      background,
      dark ? 0.07 + config.contrast / 850 : 0.05 + config.contrast / 900,
      dark ? "white" : "black",
    ),
  );
  root.style.setProperty("--accent", config.accent);
  root.style.setProperty("--accent-strong", mix(config.accent, 0.13, dark ? "white" : "black"));
  root.style.setProperty("--accent-wash", `${config.accent}24`);
  root.style.setProperty("--on-accent", dark ? "#161616" : "#ffffff");
  root.style.setProperty(
    "--glass",
    config.translucentSidebar ? `${background}cc` : mix(background, 0.09, dark ? "white" : "black"),
  );
  root.style.setProperty("--glass-border", mix(background, 0.15, dark ? "white" : "black"));
  root.classList.toggle("has-translucent-sidebar", config.translucentSidebar);
  root.classList.toggle("has-wallpaper", config.wallpaper && Boolean(wallpaperUrl));
  root.style.setProperty(
    "--wallpaper",
    wallpaperUrl ? `url(${JSON.stringify(wallpaperUrl)})` : "none",
  );
  root.style.setProperty("--wallpaper-dim", String(config.wallpaperDim / 100));
  root.style.setProperty("--wallpaper-blur", `${config.wallpaperBlur}px`);
  root.style.setProperty("--wallpaper-fit", config.wallpaperFit);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readWallpaper(): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(WALLPAPER);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}

async function writeWallpaper(blob: Blob | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    if (blob) transaction.objectStore(STORE).put(blob, WALLPAPER);
    else transaction.objectStore(STORE).delete(WALLPAPER);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function replaceWallpaperUrl(blob: Blob | null): void {
  if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = blob ? URL.createObjectURL(blob) : "";
  applyAppearance();
}

export function initAppearance(): void {
  media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => current.theme === "system" && applyAppearance());
  current = read();
  applyAppearance();
  if (current.wallpaper)
    void readWallpaper()
      .then(replaceWallpaperUrl)
      .catch(() => undefined);
}

export function setAppearance(next: Appearance): void {
  current = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  applyAppearance(next);
  listeners.forEach((listener) => listener());
}

export function setTheme(theme: ThemeMode): void {
  const light = theme === "light" || (theme === "system" && media?.matches === false);
  const defaults = light ? LIGHT_DEFAULTS : DEFAULT_APPEARANCE;
  setAppearance({ ...current, theme, ...defaults });
}

export async function setWallpaper(blob: Blob | null): Promise<void> {
  await writeWallpaper(blob);
  replaceWallpaperUrl(blob);
  setAppearance({ ...current, wallpaper: Boolean(blob) });
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_APPEARANCE,
  );
}
