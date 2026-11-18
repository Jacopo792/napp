/* A link's card, as Discord or iMessage draws one: the page's own title,
 * description, site name and picture, read from the tags a site publishes
 * for exactly this (Open Graph, then Twitter's, then plain HTML). The page
 * is fetched here, not by the reader, so no member's address reaches the
 * site; the picture is handed back as bytes for the sender to keep with
 * the message, so it never has to be fetched again. */
import { fetchPublic } from "./importImage.ts";

const PAGE_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  site?: string;
  image?: { type: string; data: string; width?: number; height?: number };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : "";
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (text: string | undefined, length: number) =>
  text ? (text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text) : undefined;

/** The preview tags of a page's HTML, by name: `og:title`, `twitter:image`… */
export function readTags(html: string): { tags: Map<string, string>; title?: string } {
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html;
  const tags = new Map<string, string>();
  for (const [meta] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attribute = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(meta);
    const key = attribute("property") ?? attribute("name");
    const value = attribute("content");
    const name = key && (key[1] ?? key[2] ?? key[3])?.toLowerCase();
    const content = value && (value[1] ?? value[2] ?? value[3]);
    if (name && content && !tags.has(name)) tags.set(name, decode(content));
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return { tags, title: title ? decode(title) : undefined };
}

/** Width and height from the first bytes of a PNG, GIF, JPEG or WebP. */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length > 10 && bytes.toString("latin1", 0, 3) === "GIF")
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length > 30 && bytes.toString("latin1", 0, 4) === "RIFF") {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8X")
      return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8 ")
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length && bytes[at] === 0xff) {
      const marker = bytes[at + 1]!;
      const length = bytes.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      at += 2 + length;
    }
  }
  return null;
}

export async function linkPreview(source: string): Promise<LinkPreview | null> {
  const page = await fetchPublic(source, ["text/html", "application/xhtml+xml"], PAGE_LIMIT);
  const { tags, title: plain } = readTags(page.bytes.toString("utf8"));
  const title = tags.get("og:title") ?? tags.get("twitter:title") ?? plain;
  if (!title) return null;
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  const preview: LinkPreview = {
    url: source,
    title: clip(title, 300)!,
    description: clip(
      tags.get("og:description") ?? tags.get("twitter:description") ?? tags.get("description"),
      500,
    ),
    site: clip(tags.get("og:site_name") ?? host, 100),
  };
  const picture =
    tags.get("og:image:secure_url") ??
    tags.get("og:image") ??
    tags.get("og:image:url") ??
    tags.get("twitter:image") ??
    tags.get("twitter:image:src");
  if (picture) {
    try {
      const image = await fetchPublic(new URL(picture, page.url).href, IMAGE_TYPES, IMAGE_LIMIT);
      preview.image = {
        type: image.type,
        data: image.bytes.toString("base64"),
        ...imageSize(image.bytes),
      };
    } catch {
      /* A card without its picture is still a card. */
    }
  }
  return preview;
}
