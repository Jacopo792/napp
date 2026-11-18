/* The photos and videos a general-chat message carries, in the web's chat:
 * one at the shape it was taken, several in a two-column grid. Their files
 * are private; each is shown through a short-lived signed address, and one
 * Storage refuses (a block, a report) is left as an empty tile. A photo opens
 * whole in a new window; a video plays in place with the browser's controls. */
import { useEffect, useState } from "react";
import { chatMediaUrls, type ChatMedia as Media } from "@/lib/comments";

const WIDTH = 240;

export function ChatMedia({ media }: { media: Media[] }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = media.map((item) => item.path).join("|");
  useEffect(() => {
    let live = true;
    void chatMediaUrls(key.split("|")).then(
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
        const url = urls.get(item.path);
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
