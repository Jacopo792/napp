/* The photos and videos a chat message carries, in the web's chat:
 * one at the shape it was taken, several in a two-column grid. Their files
 * are private; each is shown through a short-lived signed address, and one
 * Storage refuses (a block, a report) is left as an empty tile. A photo opens
 * whole in a new window; a video plays in place with the browser's controls. */
import { useEffect, useState } from "react";
import { chatMediaUrls, type ChatMedia as Media } from "@/lib/comments";

const WIDTH = 240;

/** Files this window sent, by path: drawn from the chosen file at once rather
 *  than waiting for the upload and a signed address.
 *  ponytail: object URLs are never revoked; a session sends few enough. */
export const localChatMedia = new Map<string, string>();

export function ChatMedia({ media }: { media: Media[] }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = media.map((item) => item.path).join("|");
  useEffect(() => {
    let live = true;
    const remote = key.split("|").filter((path) => !localChatMedia.has(path));
    if (!remote.length) return;
    void chatMediaUrls(remote).then(
      (found) => live && setUrls(found),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
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
