/* Stickers and GIFs for the next message: the app's own animals, and GIPHY's
 * GIFs and stickers through the collaboration server, so neither the key nor
 * the reader's address reaches GIPHY. A GIPHY picture is fetched once, shown
 * from that copy and sent as that same file. */
import { useEffect, useRef, useState } from "react";
import { Search } from "@/components/icons";
import { giphyPicture, searchGiphy, type GiphyItem } from "@/lib/comments";
import type { AppSession } from "@/lib/session";
import { STICKERS, stickerUrl } from "@/lib/stickers";

export type StickerPick =
  | { pack: "napp"; id: string }
  | {
      pack: "giphy";
      item: {
        type: "gif" | "sticker";
        giphy: string;
        title: string;
        width: number;
        height: number;
      };
      picture: Blob;
    };

type Tab = "napp" | "gif" | "sticker";

/* Pictures already fetched this session, by id; at most four in flight, which
   keeps a fast scroll from tripping the server's own limit.
   ponytail: never evicted; a session looks at a few hundred at most. */
const pictures = new Map<string, Promise<{ blob: Blob; url: string }>>();
let flying = 0;
const waiting: (() => void)[] = [];
function picture(session: AppSession, id: string) {
  let found = pictures.get(id);
  if (!found) {
    found = (async () => {
      if (flying >= 4) await new Promise<void>((go) => waiting.push(go));
      flying++;
      try {
        const blob = await giphyPicture(session, id);
        return { blob, url: URL.createObjectURL(blob) };
      } finally {
        flying--;
        waiting.shift()?.();
      }
    })();
    found.catch(() => pictures.delete(id));
    pictures.set(id, found);
  }
  return found;
}

function GiphyTile({
  session,
  item,
  type,
  onPick,
}: {
  session: AppSession;
  item: GiphyItem;
  type: "gif" | "sticker";
  onPick: (pick: StickerPick) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const node = ref.current;
    if (!node) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      void picture(session, item.id).then(
        (got) => live && setUrl(got.url),
        () => {},
      );
    });
    seen.observe(node);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [session, item.id]);
  return (
    <button
      ref={ref}
      type="button"
      className={`giphy-tile press ${type === "sticker" ? "is-sticker" : ""}`}
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
      title={item.title || undefined}
      aria-label={item.title || (type === "gif" ? "GIF" : "Sticker")}
      onClick={() =>
        void picture(session, item.id).then(
          ({ blob }) =>
            onPick({
              pack: "giphy",
              item: {
                type,
                giphy: item.id,
                title: item.title,
                width: item.width,
                height: item.height,
              },
              picture: blob,
            }),
          () => {},
        )
      }
    >
      {url && <img src={url} alt="" draggable={false} />}
    </button>
  );
}

function GiphyResults({
  session,
  type,
  onPick,
}: {
  session: AppSession;
  type: "gif" | "sticker";
  onPick: (pick: StickerPick) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [state, setState] = useState<"loading" | "idle" | "failed">("loading");
  const asked = useRef(0);

  async function load(offset: number, words: string, signal?: AbortSignal) {
    const ask = ++asked.current;
    setState("loading");
    try {
      const page = await searchGiphy(session, type, words, offset, signal);
      if (ask !== asked.current) return;
      setItems((current) => (offset ? [...current, ...page.items] : page.items));
      setNext(page.next);
      setState("idle");
    } catch {
      if (ask === asked.current && !signal?.aborted) setState("failed");
    }
  }

  /* Trending at once; a search once typing pauses. */
  useEffect(() => {
    const stop = new AbortController();
    const wait = window.setTimeout(() => void load(0, query, stop.signal), query ? 300 : 0);
    return () => {
      window.clearTimeout(wait);
      stop.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type]);

  return (
    <>
      <label className="emoji-search">
        <Search size={14} />
        <input
          autoFocus
          value={query}
          placeholder={type === "gif" ? "Search GIFs" : "Search stickers"}
          aria-label={type === "gif" ? "Search GIFs" : "Search stickers"}
          onChange={(event) => {
            setItems([]);
            setQuery(event.target.value);
          }}
        />
      </label>
      <div
        className="giphy-grid"
        onScroll={(event) => {
          const box = event.currentTarget;
          if (
            state === "idle" &&
            next !== null &&
            box.scrollHeight - box.scrollTop - box.clientHeight < 160
          )
            void load(next, query);
        }}
      >
        {items.map((item) => (
          <GiphyTile key={item.id} session={session} item={item} type={type} onPick={onPick} />
        ))}
        {state === "failed" && <p className="emoji-none">GIPHY is not answering</p>}
        {state === "idle" && !items.length && <p className="emoji-none">Nothing found</p>}
      </div>
      <p className="giphy-attribution">Powered by GIPHY</p>
    </>
  );
}

export function StickerPicker({
  session,
  onPick,
}: {
  session: AppSession;
  onPick: (pick: StickerPick) => void;
}) {
  const [tab, setTab] = useState<Tab>("napp");
  return (
    <>
      <div className="sticker-tabs" role="tablist">
        {(
          [
            ["napp", "Animals"],
            ["gif", "GIFs"],
            ["sticker", "Stickers"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`sticker-tab press ${tab === id ? "is-on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "napp" ? (
        <div className="sticker-grid">
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              className="sticker-cell press"
              title={sticker.name}
              aria-label={sticker.name}
              onClick={() => onPick({ pack: "napp", id: sticker.id })}
            >
              <img src={stickerUrl(sticker.id)!} alt="" draggable={false} />
            </button>
          ))}
        </div>
      ) : (
        <GiphyResults key={tab} session={session} type={tab} onPick={onPick} />
      )}
    </>
  );
}
