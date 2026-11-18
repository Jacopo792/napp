/* The app's own stickers: the chat bubbles' animals, whole, as die-cut vinyl.
 *
 * Pure strings of SVG, so the web shows them as images and the phone hands
 * the same markup to its SVG renderer: one drawing, every platform. The white
 * rim and the lift under it are the art itself drawn again, fatter, rather
 * than a filter, because not every renderer has filters. Same hand as
 * `ChatBubble.tsx`: flat fills, the same dark eyes, the same blush.
 *
 * A message stores only `{ pack: "napp", id }`; an id a client does not know
 * is shown as nothing rather than failing, so drawings may be added later. */

type Mood = "hi" | "yay" | "love" | "sleepy" | "oops";
type Animal = "cat" | "frog" | "bunny" | "bear" | "penguin" | "fox" | "panda" | "duck" | "axolotl";

const EYE = "#2b2420";
const BLUSH = "#f2897a";

const closed = (m: Mood) => m === "yay" || m === "love" || m === "sleepy";

function eyes(m: Mood, y = 54, dx = 12, r = 4.4, col = EYE): string {
  if (m === "yay" || m === "love")
    return `<path d="M${50 - dx - 4.5} ${y + 1.5}q4.5-6 9 0M${50 + dx - 4.5} ${y + 1.5}q4.5-6 9 0" stroke="${col}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  if (m === "sleepy")
    return `<path d="M${50 - dx - 4.5} ${y}q4.5 4.5 9 0M${50 + dx - 4.5} ${y}q4.5 4.5 9 0" stroke="${col}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return [50 - dx, 50 + dx]
    .map(
      (x) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/><circle cx="${x + 1.5}" cy="${y - 1.7}" r="${r * 0.36}" fill="#fff"/>`,
    )
    .join("");
}
const cheeks = (y = 64, dx = 21, o = 0.55) =>
  `<ellipse cx="${50 - dx}" cy="${y}" rx="5" ry="3" fill="${BLUSH}" opacity="${o}"/><ellipse cx="${50 + dx}" cy="${y}" rx="5" ry="3" fill="${BLUSH}" opacity="${o}"/>`;
function mouth(m: Mood, y = 63, col = EYE): string {
  if (m === "yay") return `<path d="M44 ${y}q6 8 12 0Z" fill="#b5523b"/>`;
  if (m === "sleepy")
    return `<ellipse cx="50" cy="${y + 1.5}" rx="2.2" ry="1.8" fill="${col}" opacity=".8"/>`;
  if (m === "oops")
    return `<path d="M45.5 ${y + 2}q4.5-3.5 9 0" stroke="${col}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return `<path d="M45.5 ${y}q2.25 2.6 4.5 0 2.25 2.6 4.5 0" stroke="${col}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
}

/* Heads on a 100-unit square, centred near (50, 56). */
const HEAD: Record<Animal, (m: Mood) => string> = {
  cat: (m) =>
    `<path d="M20 46 25 14l20 14Z" fill="#e9965b"/><path d="M80 46 75 14 55 28Z" fill="#e9965b"/><path d="M26 36 28 21l9 7Z" fill="#f7b9a6"/><path d="M74 36 72 21l-9 7Z" fill="#f7b9a6"/><ellipse cx="50" cy="56" rx="34" ry="27" fill="#e9965b"/><path d="M44 32v6M50 31v7M56 32v6" stroke="#c9733d" stroke-width="2.6" stroke-linecap="round"/>${eyes(m)}<path d="M47.4 60.5h5.2L50 63.4Z" fill="#b5523b"/>${mouth(m, 65)}${cheeks(65, 22)}<path d="M14 58h9M15 64l8-2M86 58h-9M85 64l-8-2" stroke="#c9733d" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
  frog: (m) =>
    `<ellipse cx="50" cy="60" rx="36" ry="25" fill="#9fd68b"/><circle cx="32" cy="38" r="14" fill="#9fd68b"/><circle cx="68" cy="38" r="14" fill="#9fd68b"/><circle cx="32" cy="37" r="9.5" fill="#fff"/><circle cx="68" cy="37" r="9.5" fill="#fff"/>${closed(m) ? eyes(m, 38, 18, 4) : eyes(m, 38, 18, 5.2)}${m === "yay" ? `<path d="M34 62q16 14 32 0Z" fill="#b5523b"/>` : m === "oops" ? `<path d="M38 66q12-7 24 0" stroke="#3f6b33" stroke-width="2.4" fill="none" stroke-linecap="round"/>` : `<path d="M34 62q16 10 32 0" stroke="#3f6b33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`}${cheeks(64, 26)}<circle cx="46" cy="52" r="1.3" fill="#3f6b33"/><circle cx="54" cy="52" r="1.3" fill="#3f6b33"/>`,
  bunny: (m) =>
    `<g transform="rotate(-8 38 34)"><ellipse cx="38" cy="18" rx="9" ry="22" fill="#fff" stroke="#e7e1d9" stroke-width="1.6"/><ellipse cx="38" cy="20" rx="4.2" ry="15" fill="#f6c3d0"/></g><g transform="rotate(14 62 34)"><ellipse cx="62" cy="18" rx="9" ry="22" fill="#fff" stroke="#e7e1d9" stroke-width="1.6"/><ellipse cx="62" cy="20" rx="4.2" ry="15" fill="#f6c3d0"/></g><ellipse cx="50" cy="60" rx="31" ry="25" fill="#fff" stroke="#e7e1d9" stroke-width="1.6"/>${eyes(m, 58, 12)}<ellipse cx="50" cy="64.5" rx="2.6" ry="1.9" fill="#e48aa0"/>${mouth(m, 67.5)}${cheeks(68, 20, 0.6)}`,
  bear: (m) =>
    `<circle cx="24" cy="34" r="12" fill="#c1916a"/><circle cx="76" cy="34" r="12" fill="#c1916a"/><circle cx="24" cy="34" r="6" fill="#ecd1b4"/><circle cx="76" cy="34" r="6" fill="#ecd1b4"/><ellipse cx="50" cy="58" rx="34" ry="28" fill="#c1916a"/>${eyes(m, 52, 13)}<ellipse cx="50" cy="67" rx="13" ry="9.5" fill="#ecd1b4"/><ellipse cx="50" cy="63" rx="4" ry="2.8" fill="#3a2318"/>${mouth(m, 68.5, "#3a2318")}${cheeks(64, 24)}`,
  penguin: (m) =>
    `<ellipse cx="50" cy="56" rx="34" ry="31" fill="#2e3a55"/><path d="M50 40c-8-8-27-4-27 15 0 15 13 24 27 24s27-9 27-24c0-19-19-23-27-15Z" fill="#fff"/>${eyes(m, 55, 11, 4)}<path d="M44.5 61h11L50 67.5Z" fill="#f2a33a"/>${cheeks(66, 19, 0.6)}`,
  fox: (m) =>
    `<path d="M17 44 22 10l21 17Z" fill="#e8793a"/><path d="M83 44 78 10 57 27Z" fill="#e8793a"/><path d="M20 19 22 10l6 5Z" fill="#3a2318"/><path d="M80 19l-2-9-6 5Z" fill="#3a2318"/><path d="M13 44c13-18 61-18 74 0-5 25-23 40-37 41C36 84 18 69 13 44Z" fill="#e8793a"/><path d="M19 51c9 14 21 23 31 25 10-2 22-11 31-25-11 6-20 8-31 17-11-9-20-11-31-17Z" fill="#fff6ee"/>${eyes(m, 52, 13)}<ellipse cx="50" cy="69" rx="4" ry="3" fill="#3a2318"/>${cheeks(62, 25, 0.45)}`,
  panda: (m) =>
    `<circle cx="25" cy="30" r="11" fill="#23211f"/><circle cx="75" cy="30" r="11" fill="#23211f"/><ellipse cx="50" cy="57" rx="35" ry="28" fill="#fff" stroke="#e7e1d9" stroke-width="1.6"/><ellipse cx="36" cy="54" rx="8" ry="10.5" fill="#23211f" transform="rotate(-25 36 54)"/><ellipse cx="64" cy="54" rx="8" ry="10.5" fill="#23211f" transform="rotate(25 64 54)"/>${eyes(m, 53, 13, 3, "#fff")}${closed(m) ? "" : `<circle cx="37" cy="53" r="1.6" fill="#23211f"/><circle cx="63" cy="53" r="1.6" fill="#23211f"/>`}<ellipse cx="50" cy="65" rx="4" ry="2.8" fill="#23211f"/>${mouth(m, 69)}${cheeks(70, 25, 0.6)}`,
  duck: (m) =>
    `<path d="M48 24q2-12 9-6" stroke="#f7d046" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="50" cy="56" r="32" fill="#f7d046"/>${eyes(m, 52, 13)}<path d="M37 63q13-6 26 0-3 9-13 9t-13-9Z" fill="#f08a2b"/><path d="M39 64.5q11 3 22 0" stroke="#d86f1c" stroke-width="1.4" fill="none" opacity=".7"/>${cheeks(64, 24)}`,
  axolotl: (m) =>
    `${[-1, 1]
      .map(
        (s) =>
          `<g${s > 0 ? ` transform="translate(100 0) scale(-1 1)"` : ""}><ellipse cx="14" cy="34" rx="12" ry="4.4" fill="#ec7fa6" transform="rotate(30 14 34)"/><ellipse cx="10" cy="50" rx="12" ry="4.4" fill="#ec7fa6"/><ellipse cx="14" cy="66" rx="12" ry="4.4" fill="#ec7fa6" transform="rotate(-30 14 66)"/></g>`,
      )
      .join(
        "",
      )}<ellipse cx="50" cy="55" rx="33" ry="27" fill="#f7b3cb"/>${eyes(m, 52, 15, 4)}${m === "yay" ? `<path d="M38 61q12 12 24 0Z" fill="#b5523b"/>` : `<path d="M38 61q12 9 24 0" stroke="#8a3456" stroke-width="2.2" fill="none" stroke-linecap="round"/>`}${cheeks(62, 25, 0.7)}`,
};

const BODY: Record<Animal, string> = {
  cat: "#e9965b",
  frog: "#9fd68b",
  bunny: "#fff",
  bear: "#c1916a",
  penguin: "#2e3a55",
  fox: "#e8793a",
  panda: "#23211f",
  duck: "#f7d046",
  axolotl: "#f7b3cb",
};

const heart = (x: number, y: number, s: number, c: string) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 4C-4-2-11 1-8 7-6 10 0 14 0 14S6 10 8 7C11 1 4-2 0 4Z" fill="${c}"/>`;
const spark = (x: number, y: number, s: number, c: string) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0-7C1-2 2-1 7 0 2 1 1 2 0 7-1 2-2 1-7 0-2-1-1-2 0-7Z" fill="${c}"/>`;
const paw = (x: number, y: number, col: string, rot = 0) =>
  `<ellipse cx="${x}" cy="${y}" rx="8" ry="6.5" fill="${col}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}/>`;
const EXTRAS: Record<Mood, string> = {
  love: heart(82, 18, 1.2, "#e0605a") + heart(14, 30, 0.7, "#f08c9a"),
  yay:
    spark(84, 20, 1.2, "#f2b13a") + spark(14, 24, 0.8, "#7cc3e8") + spark(88, 46, 0.6, "#f08c9a"),
  sleepy: `<path d="M74 16h9l-9 10h9M86 6h6l-6 7h6" stroke="#8b7a7d" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  oops: `<path d="M80 38c-3 5-3 8 0 9 3-1 3-4 0-9Z" fill="#7cc3e8"/>`,
  hi: "",
};

/** The whole creature: a little body and feet under its head, a waving paw
 *  for hello, and what its mood gives off. */
function creature(animal: Animal, mood: Mood): string {
  const col = BODY[animal];
  const edge = col === "#fff" ? ` stroke="#e7e1d9" stroke-width="1.6"` : "";
  return (
    `<ellipse cx="50" cy="90" rx="24" ry="8" fill="${col}"${edge}/>` +
    `<ellipse cx="35" cy="86" rx="8" ry="6.5" fill="${col}"${edge}/><ellipse cx="65" cy="86" rx="8" ry="6.5" fill="${col}"${edge}/>` +
    HEAD[animal](mood) +
    (mood === "hi" ? paw(84, 60, col, -30) : "") +
    EXTRAS[mood]
  );
}

/** The same shapes with every paint taken off, to be painted once, fat. */
const silhouette = (art: string) =>
  art.replace(/ (?:fill|stroke|stroke-width|opacity|stroke-linecap|stroke-linejoin)="[^"]*"/g, "");

export const STICKERS = [
  { id: "cat.hi", name: "Cat waving" },
  { id: "cat.love", name: "Cat in love" },
  { id: "frog.yay", name: "Frog cheering" },
  { id: "frog.oops", name: "Frog sorry" },
  { id: "bunny.love", name: "Bunny in love" },
  { id: "bunny.sleepy", name: "Bunny sleepy" },
  { id: "bear.hi", name: "Bear waving" },
  { id: "bear.oops", name: "Bear sorry" },
  { id: "penguin.sleepy", name: "Penguin sleepy" },
  { id: "penguin.yay", name: "Penguin cheering" },
  { id: "fox.yay", name: "Fox cheering" },
  { id: "fox.hi", name: "Fox waving" },
  { id: "panda.love", name: "Panda in love" },
  { id: "panda.sleepy", name: "Panda sleepy" },
  { id: "duck.hi", name: "Duckling waving" },
  { id: "duck.yay", name: "Duckling cheering" },
  { id: "axolotl.yay", name: "Axolotl cheering" },
  { id: "axolotl.love", name: "Axolotl in love" },
] as const;

export function stickerName(id: string): string | null {
  return STICKERS.find((sticker) => sticker.id === id)?.name ?? null;
}

/** The sticker's SVG document, or null for an id this client does not know. */
export function stickerSvg(id: string): string | null {
  if (!stickerName(id)) return null;
  const [animal, mood] = id.split(".") as [Animal, Mood];
  const art = creature(animal, mood);
  const shape = silhouette(art);
  /* Lift, rim, art: the shadow and the white edge are the creature itself,
     drawn 9 units fat, so they follow every ear and paw. */
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 110">` +
    `<g transform="translate(0 2.6)" fill="#6b3640" stroke="#6b3640" stroke-width="10" stroke-linejoin="round" opacity=".14">${shape}</g>` +
    `<g fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round">${shape}</g>` +
    art +
    `</svg>`
  );
}

/** For an `<img>`: the same document as a data address. */
export function stickerUrl(id: string): string | null {
  const svg = stickerSvg(id);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}
