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

/* The palette the archive's own reader settled on, and so the one a new
   account opens to: near-black paper, one grey accent, no colour anywhere the
   words are not. The accent is deliberately darker than it can be drawn — the
   derivation below lifts it to the contrast floor rather than taking it
   literally, which is how a value this low is safe to ship as a default. */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  accent: "#151313",
  background: "#030202",
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
    id: "ink",
    name: "Ink",
    theme: "dark" as const,
    accent: "#151313",
    background: "#030202",
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
  /* The rest, and all of them dark on purpose. `setTheme()` below still
     replaces the three colours whenever the THEME segment is touched, so a
     light preset added here would be wiped by the click that selects its own
     theme. */
  {
    id: "fjord",
    name: "Fjord",
    theme: "dark" as const,
    accent: "#88c0d0",
    background: "#2e3440",
    foreground: "#eceff4",
  },
  {
    id: "indigo",
    name: "Indigo",
    theme: "dark" as const,
    accent: "#7f7bff",
    background: "#1a1a26",
    foreground: "#eeeef5",
  },
  /* Three warmths the six above do not have between them: lamplight, a green
     that is a colour and not a signal, and a rose. Each background carries the
     accent's own hue at a fraction of its saturation, which is what keeps a
     palette from reading as one colour dropped onto neutral grey. */
  {
    id: "amber",
    name: "Amber",
    theme: "dark" as const,
    accent: "#e5975c",
    background: "#1c1714",
    foreground: "#f2e8df",
  },
  {
    id: "sage",
    name: "Sage",
    theme: "dark" as const,
    accent: "#a3c9a8",
    background: "#1a201c",
    foreground: "#e8eee9",
  },
  {
    id: "rosewood",
    name: "Rosewood",
    theme: "dark" as const,
    accent: "#e59aa4",
    background: "#221c1e",
    foreground: "#f3e9ea",
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

/* ── What a colour is worth on the ground it is drawn on ─────────────────────
   The accent is the reader's, and the interface asks two different things of
   it: it fills controls, and it draws lines and words. A colour can be fine
   for one and useless for the other, and picking `--on-accent` from the theme
   rather than from the accent is what made a near-black accent paint black
   text on a black button — "New note" was there and unreadable, and so was
   every focus ring and active rule.

   So: the hue stays the reader's, and the value is moved only as far as it has
   to be for the thing to be visible at all. WCAG relative luminance, and the
   ordinary contrast ratio between two opaque colours. */
function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const one = luminance(a);
  const other = luminance(b);
  const [high, low] = one > other ? [one, other] : [other, one];
  return (high + 0.05) / (low + 0.05);
}

/** The same colour, moved toward the far end of the scale in small steps until
 *  it can be seen against `ground` — and not one step further. */
export function legibleOn(colour: string, ground: string, ratio: number): string {
  const toward = luminance(ground) < 0.18 ? "white" : "black";
  let lifted = colour;
  for (let step = 1; step <= 20 && contrastRatio(lifted, ground) < ratio; step++) {
    lifted = mix(colour, step * 0.05, toward);
  }
  return lifted;
}

/* Semantic colour has to answer to the mode as well. These values were tuned
   against a near-black ground; on a cream one the pale red and the pale mint
   are the same brightness as the paper they sit on, which is how a light
   palette ends up unreadable while every neutral looks fine. */
const SEMANTIC = {
  dark: {
    "--danger": "#ffa5a8",
    "--danger-fill": "#b3272c",
    "--on-danger": "#fafafa",
    "--ok": "#7fd1a8",
    "--tint-yellow": "#e8c46a",
    "--tint-purple": "#c69cf0",
    "--tint-pink": "#f095b7",
    "--tint-orange": "#efa86f",
    "--tint-mint": "#79ddb2",
    "--tint-blue": "#8fb6f5",
    "--glass-highlight": "rgb(255 255 255 / 0.06)",
    "--shadow-soft": "0 1px 2px rgb(0 0 0 / 0.28), 0 10px 28px -12px rgb(0 0 0 / 0.5)",
    "--shadow-popover": "0 22px 64px rgb(0 0 0 / 0.44)",
  },
  light: {
    "--danger": "#b0232a",
    "--danger-fill": "#b3272c",
    "--on-danger": "#ffffff",
    "--ok": "#15734b",
    "--tint-yellow": "#8a6410",
    "--tint-purple": "#6d3cab",
    "--tint-pink": "#ad2f61",
    "--tint-orange": "#9c4f12",
    "--tint-mint": "#0f7355",
    "--tint-blue": "#2757b0",
    "--glass-highlight": "rgb(255 255 255 / 0.72)",
    "--shadow-soft": "0 1px 2px rgb(0 0 0 / 0.05), 0 10px 28px -12px rgb(0 0 0 / 0.18)",
    "--shadow-popover": "0 22px 64px rgb(0 0 0 / 0.16)",
  },
} as const;

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
  /* The two muted inks are the whole legibility budget of the interface: every
     metadata line, every list marker and every idle glyph is one of them, and
     they were mixed far enough toward the ground to read as "disabled" on
     controls that were not.

     Measured against `--paper`, which is the worst case and not the obvious
     one — on the default theme the sidebar and the catalogue are *lighter*
     than the note page, so the densest text in the app sits on the lowest
     contrast. `--ink-3` was 3.4:1 there and is 4.5:1 now, which is AA for a
     sentence.

     `--ink-4` cannot join it: four distinct tiers below `#e8e8e8` do not fit
     above 4.5:1 on that ground. It is held at 3.4:1 — over the 3:1 floor for
     an icon or a large label, which is all it is for. It is not a tier to set
     a sentence in. */
  root.style.setProperty("--ink-3", mix(foreground, dark ? 0.24 : 0.26, dark ? "black" : "white"));
  root.style.setProperty("--ink-4", mix(foreground, dark ? 0.34 : 0.36, dark ? "black" : "white"));
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
  /* Drawn on `--paper`, which is where the accent does most of its work: the
     active row, the focus ring, the marker under a tab. 3:1 is the floor for a
     line or a large label; `--accent-strong` carries sentences, so it takes
     the 4.5:1 one. A colour that already clears them is left exactly as the
     reader chose it. */
  const paper = mix(
    background,
    dark ? 0.11 + contrastShift * 0.08 : 0.035,
    dark ? "white" : "black",
  );
  const accent = legibleOn(config.accent, paper, 3);
  const onAccent =
    contrastRatio(accent, "#f7f7f7") >= contrastRatio(accent, "#161616") ? "#f7f7f7" : "#161616";
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-strong", legibleOn(config.accent, paper, 4.5));
  root.style.setProperty("--accent-wash", `${accent}24`);
  root.style.setProperty("--on-accent", onAccent);
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
  root.style.setProperty(
    "--wallpaper-filter",
    config.wallpaperBlur > 0 ? `blur(${config.wallpaperBlur}px)` : "none",
  );
  root.style.setProperty("--wallpaper-fit", config.wallpaperFit);
  for (const [token, value] of Object.entries(SEMANTIC[dark ? "dark" : "light"])) {
    root.style.setProperty(token, value);
  }
  /* The browser paints its own chrome — address bar on the phone, the band
     behind a scrolled page — from this tag, and it was nailed to the graphite
     default in the markup. A reader on the Paper theme got a black strip above
     a white app. */
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
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
