/* The photos and videos a chat message carries, in the web's chat:
 * one at the shape it was taken, several in a two-column grid. Their files
 * are private; each is shown through a short-lived signed address, and one
 * Storage refuses (a block, a report) is left as an empty tile. A photo opens
 * whole in a new window; a video plays in place with the browser's controls. */
import { useEffect, useState } from "react";
import {
  chatMediaUrls,
  type ChatLink,
  type ChatMedia as Media,
  type ChatSticker as Sticker,
} from "@/lib/comments";
import { stickerName, stickerUrl } from "@/lib/stickers";

const WIDTH = 240;

/** Files this window sent, by path: drawn from the chosen file at once rather
 *  than waiting for the upload and a signed address.
 *  ponytail: object URLs are never revoked; a session sends few enough. */
export const localChatMedia = new Map<string, string>();

/** Loadable addresses for a message's files: its own copies first. */
function useChatUrls(paths: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = paths.join("|");
  useEffect(() => {
    let live = true;
    const remote = key.split("|").filter((path) => path && !localChatMedia.has(path));
    if (!remote.length) return;
    void chatMediaUrls(remote).then(
      (found) => live && setUrls(found),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  return urls;
}

export function ChatMedia({ media }: { media: Media[] }) {
  const urls = useChatUrls(media.map((item) => item.path));
  const single = media.length === 1;
  return (
    <div className={`chat-media ${single ? "is-single" : ""}`}>
      {media.map((item) => {
        const url = localChatMedia.get(item.path) ?? urls.get(item.path);
        const ratio = Math.min(1.5, Math.max(0.6, (item.width || 4) / (item.height || 3)));
        const style = single ? { width: WIDTH, aspectRatio: String(ratio) } : { aspectRatio: "1" };
        if (item.kind === "video")
          return (
            <video
              key={item.path}
              className="chat-media-item"
              style={style}
              src={url}
              controls
              playsInline
              preload="metadata"
            />
          );
        return (
          <a
            key={item.path}
            className="chat-media-item"
            style={style}
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open photo"
          >
            {url && <img src={url} alt="" loading="lazy" draggable={false} />}
          </a>
        );
      })}
    </div>
  );
}

/** A link's card under its message, as the sender's window read it: the
 *  page's picture, site, title and description, opening the page. */
export function ChatLinkCard({ link }: { link: ChatLink }) {
  const urls = useChatUrls(link.image ? [link.image] : []);
  const picture = link.image && (localChatMedia.get(link.image) ?? urls.get(link.image));
  const ratio = Math.min(2, Math.max(1, (link.width || 1200) / (link.height || 630)));
  return (
    <a className="chat-link-card press" href={link.url} target="_blank" rel="noreferrer">
      {link.image && (
        <span className="chat-link-picture" style={{ aspectRatio: String(ratio) }}>
          {picture && <img src={picture} alt="" loading="lazy" draggable={false} />}
        </span>
      )}
      <span className="chat-link-words">
        {link.site && <span className="chat-link-site">{link.site}</span>}
        <span className="chat-link-title">{link.title}</span>
        {link.description && <span className="chat-link-description">{link.description}</span>}
      </span>
    </a>
  );
}

/** A sticker or GIF sent as the message: the app's own drawn here, a GIPHY
 *  one from its copy in `chat-media`. No bubble; a GIF keeps rounded corners
 *  like a photo, a sticker stands free like ours. */
export function ChatStickerView({ sticker, mine }: { sticker: Sticker; mine: boolean }) {
  const urls = useChatUrls(sticker.pack === "giphy" ? [sticker.path] : []);
  if (sticker.pack === "napp") {
    const url = stickerUrl(sticker.id);
    if (!url) return null;
    return (
      <img
        className="chat-sticker"
        src={url}
        alt={stickerName(sticker.id) ?? "Sticker"}
        draggable={false}
      />
    );
  }
  const url = localChatMedia.get(sticker.path) ?? urls.get(sticker.path);
  const width = Math.min(200, sticker.width);
  return (
    <span
      className={`chat-giphy ${sticker.type === "gif" ? "is-gif" : ""} ${mine ? "is-mine" : ""}`}
    >
      <span
        className="chat-giphy-picture"
        style={{ width, aspectRatio: `${sticker.width} / ${sticker.height}` }}
      >
        {url && <img src={url} alt={sticker.title || "GIF"} draggable={false} />}
      </span>
      <span className="chat-giphy-source">via GIPHY</span>
    </span>
  );
}
