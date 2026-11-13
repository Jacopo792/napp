import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "dark" | "light";

/** How the app's glyphs are drawn: bare, in the ink, or each on a tile washed
 *  with one hue. The coloured and dark tiles that stood beside these were
 *  removed; a value saved under either name reads as `clear`. */
export type IconStyle = "clear" | "tinted";
export const ICON_STYLES: readonly IconStyle[] = ["clear", "tinted"];

/** The system's own hues, offered wherever a colour is a choice rather than a
 *  palette: the text highlight and the folders. */
export const SYSTEM_COLOURS = [
  { id: "#0a84ff", name: "Blue" },
  { id: "#bf5af2", name: "Purple" },
  { id: "#ff375f", name: "Pink" },
  { id: "#ff453a", name: "Red" },
  { id: "#ff9f0a", name: "Orange" },
  { id: "#ffd60a", name: "Yellow" },
  { id: "#30d158", name: "Green" },
  { id: "#8e8e93", name: "Graphite" },
] as const;

export interface Appearance {
  theme: ThemeMode;
  accent: string;
  background: string;
  foreground: string;
  contrast: number;
  /** Every surface of the app's own chrome, not only the rail: the name is
   *  older than what it governs and is kept because it is a stored key, and
   *  renaming one loses the setting of everybody who has one. */
  translucentSidebar: boolean;
  wallpaper: boolean;
  /** The archive object holding the picture's bytes, once it has been shared
   *  with the account. Null while the picture is only on this device — which
   *  is what `setWallpaper` leaves behind, and what `accountPreferences` reads
   *  as "upload this". */
  wallpaperObject: string | null;
  wallpaperDim: number;
  wallpaperBlur: number;
  wallpaperFit: "cover" | "contain";
  /** Liquid Glass, from clear (0) to tinted (100): how much of the palette a
   *  translucent surface carries over what is behind it. */
  glass: number;
  /** `"auto"` or a hex colour. */
  highlight: string;
  iconStyle: IconStyle;
  /** The one hue a Tinted icon style uses: `"auto"` (the accent) or a hex. */
  iconTint: string;
  /** `"auto"` or a hex colour. */
  folderColour: string;
  /** Glass over a wallpaper that blurs the picture into light, and palettes
   *  that bring a picture of their own. Off — the default — is the plainer
   *  glass of 0.9.14, which some readers prefer. */
  frosted: boolean;
}

/* A new account opens on Graphite: the grey a Mac window is, and the system's
   own blue for the one thing that can be acted on. Ink — near-black with a
   grey accent — was the default once and is gone from the presets: a toggle
   drawn grey on grey is a toggle nobody can read the state of. */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  /* Fjord: the palette a first opening and Reset appearance land on. */
  accent: "#88c0d0",
  background: "#2e3440",
  foreground: "#eceff4",
  contrast: 50,
  translucentSidebar: false,
  wallpaper: false,
  wallpaperObject: null,
  wallpaperDim: 42,
  wallpaperBlur: 0,
  wallpaperFit: "cover",
  glass: 72,
  highlight: "auto",
  iconStyle: "clear",
  iconTint: "auto",
  folderColour: "auto",
  /* Off until asked for: opening Napp after the update looks as it did. */
  frosted: false,
};

/* Ten starting points, each a ground, an ink and one colour to act with. Four
   the reader kept out of seventeen (2026-11-13) — Fjord and Rosewood, their
   own favourites, exactly as they were — and six made in the same manner:
   a ground carrying a little of its accent's hue, and an accent muted enough
   to read beside text rather than shout over it. Mist and Blush are Fjord's
   and Rosewood's light sides. They are starting points only: what is stored is the
   three colours, so a reader who chose one keeps it when this list changes. */
export const APPEARANCE_PRESETS = [
  /* Warm paper and an ink-blue. A light preset sets its own theme when it is
     pressed; touching the THEME segment afterwards still resets the three
     colours. */
  {
    id: "paper",
    name: "Paper",
    theme: "light" as const,
    accent: "#2f6fd6",
    background: "#f8f5ee",
    foreground: "#28241e",
  },
  {
    id: "fjord",
    name: "Fjord",
    theme: "dark" as const,
    accent: "#88c0d0",
    background: "#2e3440",
    foreground: "#eceff4",
  },
  {
    id: "rosewood",
    name: "Rosewood",
    theme: "dark" as const,
    accent: "#e59aa4",
    background: "#221c1e",
    foreground: "#f3e9ea",
  },
  /* Near-black and the yellow every notebook app on the platform is lit by. */
  {
    id: "night",
    name: "Night",
    theme: "dark" as const,
    accent: "#ffd60a",
    background: "#121214",
    foreground: "#ececea",
  },
  {
    id: "sage",
    name: "Sage",
    theme: "dark" as const,
    accent: "#a3be8c",
    background: "#252a27",
    foreground: "#e7ece5",
  },
  {
    id: "dune",
    name: "Dune",
    theme: "dark" as const,
    accent: "#d9a76a",
    background: "#29241f",
    foreground: "#f1e8dc",
  },
  {
    id: "dusk",
    name: "Dusk",
    theme: "dark" as const,
    accent: "#b48ead",
    background: "#25222e",
    foreground: "#ece8f3",
  },
  {
    id: "mist",
    name: "Mist",
    theme: "light" as const,
    accent: "#5e81ac",
    background: "#eceff4",
    foreground: "#2e3440",
  },
  {
    id: "blush",
    name: "Blush",
    theme: "light" as const,
    accent: "#b4606d",
    background: "#f6eeee",
    foreground: "#2c2325",
  },
  {
    id: "linen",
    name: "Linen",
    theme: "light" as const,
    accent: "#8a6a45",
    background: "#f2efe8",
    foreground: "#2a2824",
  },
] as const;

/* The palettes offered before 2026-11-13, by their colours only: a reader who
   chose one keeps it, though it is no longer offered. */
const RETIRED_COLOURS = [
  ["#0a84ff", "#1c1c1e", "#ececec"], // graphite, the default until then
  ["#64d2ff", "#0f1724", "#e6eef7"], // midnight
  ["#d6a4ff", "#1d1622", "#f2eaf6"], // plum
  ["#ff9f43", "#1c1612", "#f3e9de"], // espresso
  ["#5fd88a", "#131a15", "#e5eee7"], // moss
  ["#d2c3f6", "#23212c", "#f1fec8"], // cosmic
  ["#f1fec8", "#36255c", "#efe9fc"], // violet
  ["#36255c", "#d2c3f6", "#1b1530"], // lavender
  ["#36255c", "#f1fec8", "#1d1f12"], // vanilla
  ["#5fd4c4", "#0e2226", "#e3f2f1"], // abyss
  ["#ff8a4c", "#1e1210", "#f6e7dc"], // ember
  ["#a9c8a0", "#121c17", "#e4ece5"], // pine
  ["#7fe3d6", "#10142a", "#e8ecfb"], // aurora
];

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
let appearanceFrame: number | null = null;

function validHex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function autoOrHex(value: unknown): string {
  return value === "auto" ? "auto" : validHex(value, "auto");
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
      wallpaperObject: typeof parsed.wallpaperObject === "string" ? parsed.wallpaperObject : null,
      wallpaperDim: clamp(parsed.wallpaperDim, 0, 80, DEFAULT_APPEARANCE.wallpaperDim),
      wallpaperBlur: clamp(parsed.wallpaperBlur, 0, 20, DEFAULT_APPEARANCE.wallpaperBlur),
      wallpaperFit: parsed.wallpaperFit === "contain" ? "contain" : "cover",
      glass: clamp(parsed.glass, 0, 100, DEFAULT_APPEARANCE.glass),
      highlight: autoOrHex(parsed.highlight),
      iconStyle: ICON_STYLES.includes(parsed.iconStyle as IconStyle)
        ? (parsed.iconStyle as IconStyle)
        : DEFAULT_APPEARANCE.iconStyle,
      iconTint: autoOrHex(parsed.iconTint),
      folderColour: autoOrHex(parsed.folderColour),
      frosted: parsed.frosted === true,
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

/* Colours are chosen from the palettes only. A free colour saved by an older
   version stays in the stored preferences, unread: it draws as the theme's own
   ground instead of a stranger's colours, and nothing is rewritten. */
const KNOWN_COLOURS = new Set([
  ...[...APPEARANCE_PRESETS, LIGHT_DEFAULTS, DEFAULT_APPEARANCE].map((p) =>
    `${p.accent}${p.background}${p.foreground}`.toLowerCase(),
  ),
  ...RETIRED_COLOURS.map((colours) => colours.join("").toLowerCase()),
]);

function coloursOf(config: Appearance) {
  const { accent, background, foreground } = config;
  if (KNOWN_COLOURS.has(`${accent}${background}${foreground}`.toLowerCase())) return config;
  return darkMode(config) ? DEFAULT_APPEARANCE : LIGHT_DEFAULTS;
}

export function applyAppearance(config = current): void {
  const root = document.documentElement;
  const dark = darkMode(config);
  const colours = coloursOf(config);
  const background = colours.background;
  const foreground = colours.foreground;
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
  /* Windows owns the caption buttons, so the native strip follows the page
     ground and ink whenever a reader changes palette. A wallpaper is content,
     not something Windows can safely crop into window controls; its own base
     palette remains the visual bridge between the two. */
  const nativeFrame = (
    window as unknown as {
      napp?: { setFrameTheme?: (color: string, symbolColor: string) => void };
    }
  ).napp;
  nativeFrame?.setFrameTheme?.(background, foreground);
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
  const accent = legibleOn(colours.accent, paper, 3);
  const onAccent =
    contrastRatio(accent, "#f7f7f7") >= contrastRatio(accent, "#161616") ? "#f7f7f7" : "#161616";
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-strong", legibleOn(colours.accent, paper, 4.5));
  root.style.setProperty("--accent-wash", `${accent}24`);
  /* Tinted icons take the accent unless the reader gave them a hue of their
     own, lifted to the same floors the accent is so a dark tint stays a
     visible glyph. */
  const tint = autoOrHex(config.iconTint);
  root.style.setProperty("--icon-tint", tint === "auto" ? accent : legibleOn(tint, paper, 3));
  root.style.setProperty(
    "--icon-tint-strong",
    tint === "auto" ? legibleOn(colours.accent, paper, 4.5) : legibleOn(tint, paper, 4.5),
  );
  /* The tile of the place you are in is filled, and its glyph is whichever
     of the two inks reads on that fill. */
  const fill = tint === "auto" ? accent : legibleOn(tint, paper, 3);
  root.style.setProperty(
    "--on-icon-tint",
    contrastRatio(fill, "#f7f7f7") >= contrastRatio(fill, "#161616") ? "#f7f7f7" : "#161616",
  );
  root.style.setProperty("--on-accent", onAccent);
  root.style.setProperty(
    "--glass",
    config.translucentSidebar ? `${background}cc` : mix(background, 0.09, dark ? "white" : "black"),
  );
  root.style.setProperty("--glass-border", mix(background, 0.15, dark ? "white" : "black"));
  root.classList.toggle("has-translucent-sidebar", config.translucentSidebar);
  root.classList.toggle("has-frosted-glass", config.frosted);
  /* Liquid Glass: the share of the palette laid over a translucent surface.
     Two ranges, because the Mac's own material is already a tint and a CSS
     backdrop blur is not — the same "clear" is a lighter coat over vibrancy. */
  const glass = clamp(config.glass, 0, 100, DEFAULT_APPEARANCE.glass);
  root.style.setProperty("--glass-tint", `${40 + glass / 2}%`);
  root.style.setProperty("--glass-tint-native", `${20 + glass / 2}%`);
  root.style.setProperty("--glass-tint-menu", `${70 + glass / 4}%`);
  /* Checked here, where every source ends up: the account's row is merged in
     unvalidated, and may still carry a style that no longer exists. */
  root.dataset.iconStyle = ICON_STYLES.includes(config.iconStyle) ? config.iconStyle : "clear";
  const folder = autoOrHex(config.folderColour);
  if (folder === "auto") root.style.removeProperty("--folder-tint");
  else root.style.setProperty("--folder-tint", folder);
  const highlight = autoOrHex(config.highlight);
  root.style.setProperty(
    "--selection",
    highlight !== "auto"
      ? `${highlight}59`
      : dark
        ? "rgb(255 255 255 / 0.22)"
        : "rgb(0 0 0 / 0.14)",
  );
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

/* The colour controls can emit much faster than a display can paint. Applying
   every intermediate palette means recalculating the whole token set, then
   rerendering every subscriber, for values that never reach a frame. Keep the
   newest one and commit it once before the next paint. `current` itself still
   changes synchronously, so another setting composed in the same turn always
   starts from the value the reader just chose. */
function commitAppearance(): void {
  appearanceFrame = null;
  const commit = () => {
    applyAppearance(current);
    listeners.forEach((listener) => listener());
  };
  /* Light to dark is the whole window changing at once, so it crossfades
     rather than cutting. Only that change: the colour sliders commit every
     frame, and each must not start a transition of its own. */
  const flips =
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme !== (darkMode(current) ? "dark" : "light");
  if (
    !flips ||
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return commit();
  document.startViewTransition(commit);
}

function scheduleAppearanceCommit(): void {
  if (appearanceFrame !== null) return;
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    commitAppearance();
    return;
  }
  appearanceFrame = window.requestAnimationFrame(commitAppearance);
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
  scheduleAppearanceCommit();
}

export function setTheme(theme: ThemeMode): void {
  const light = theme === "light" || (theme === "system" && media?.matches === false);
  const defaults = light ? LIGHT_DEFAULTS : DEFAULT_APPEARANCE;
  setAppearance({ ...current, theme, ...defaults });
}

/** A picture chosen here lands on this device first and is shared afterwards:
 *  `wallpaperObject` is cleared so `accountPreferences` knows there are bytes
 *  the account has not been given yet. */
export async function setWallpaper(blob: Blob | null): Promise<void> {
  await writeWallpaper(blob);
  replaceWallpaperUrl(blob);
  setAppearance({ ...current, wallpaper: Boolean(blob), wallpaperObject: null });
}

/** The bytes this device holds, for the one caller that uploads them. */
export function wallpaperBlob(): Promise<Blob | null> {
  return readWallpaper();
}

/** The bytes another browser chose, arriving. */
export async function adoptWallpaper(blob: Blob): Promise<void> {
  await writeWallpaper(blob);
  replaceWallpaperUrl(blob);
}

/** The current values, and a way to be told when they move. `accountPreferences`
 *  is the only caller that is not a component: it pushes what changes here up
 *  to the profile row so the next browser opens to the same archive. */
export function currentAppearance(): Appearance {
  return current;
}

export function subscribeToAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
