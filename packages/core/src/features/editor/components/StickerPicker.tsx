/* Stickers and GIFs for the next message: the app's own animals; GIPHY's GIFs
 * and stickers through the collaboration server, so neither the key nor the
 * reader's address reaches GIPHY; and the archive's own stickers, which its
 * members import. A GIPHY picture is fetched once, shown from that copy and
 * sent as that same file.
 *
 * Before anything is typed the GIFs open on shelves, as Discord lays them
 * out: Favorites, Trending, then a word per mood with its first GIF as the
 * cover. Anything can be starred; the stars are the account's. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, Plus, Search, Star, StarFilled, TrendingUp, X } from "@/components/icons";
import {
  chatMediaUrls,
  giphyCategories,
  giphyPicture,
  searchGiphy,
  type GiphyItem,
} from "@/lib/comments";
import type { AppSession } from "@/lib/session";
import {
  addPackSticker,
  loadStickerPack,
  removePackSticker,
  STICKER_MAX_BYTES,
  STICKER_TYPES,
  type PackSticker,
} from "@/lib/stickerPack";
import { STICKERS, stickerName, stickerUrl } from "@/lib/stickers";
import {
  currentWritingPreferences,
  favoriteKey,
  setWritingPreferences,
  toggleFavorite,
  useWritingPreferences,
  type ChatFavorite,
} from "@/lib/writingPreferences";

type GiphyPickItem = {
  type: "gif" | "sticker";
  giphy: string;
  title: string;
  width: number;
  height: number;
};

export type StickerPick =
  | { pack: "napp"; id: string }
  | { pack: "giphy"; item: GiphyPickItem; picture: Blob }
  | { pack: "own"; sticker: PackSticker; url: string };

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

/** A GIPHY picture once its tile scrolls into view. */
function useGiphyUrl(session: AppSession, id: string | undefined) {
  const ref = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const node = ref.current;
    if (!node || !id) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      void picture(session, id).then(
        (got) => live && setUrl(got.url),
        () => {},
      );
    });
    seen.observe(node);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [session, id]);
  return { ref: ref as RefObject<HTMLButtonElement>, url };
}

/** Starred or not, from anywhere in the picker. */
function useStar(favorite: ChatFavorite): [boolean, () => void] {
  const { chatFavorites } = useWritingPreferences();
  const key = favoriteKey(favorite);
  return [
    chatFavorites.some((one) => favoriteKey(one) === key),
    () => {
      const now = currentWritingPreferences();
      setWritingPreferences({
        ...now,
        chatFavorites: toggleFavorite(now.chatFavorites, favorite),
      });
    },
  ];
}

/** A tile with the star in its corner, shown on hover; and, for a sticker
 *  of your own, the way to take it out of the pack. */
function Slot({
  favorite,
  className,
  children,
  onRemove,
}: {
  favorite: ChatFavorite;
  className: string;
  children: ReactNode;
  onRemove?: () => void;
}) {
  const [starred, toggle] = useStar(favorite);
  return (
    <div className={`pick-slot ${className} ${starred ? "is-starred" : ""}`}>
      {children}
      <button
        type="button"
        className="pick-star press"
        aria-label={starred ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={starred}
        title={starred ? "Remove from favorites" : "Add to favorites"}
        onClick={toggle}
      >
        {starred ? <StarFilled size={13} /> : <Star size={13} />}
      </button>
      {onRemove && (
        <button
          type="button"
          className="pick-remove press"
          aria-label="Remove sticker"
          title="Remove sticker"
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function NappCell({ id, onPick }: { id: string; onPick: (pick: StickerPick) => void }) {
  const name = stickerName(id);
  const url = stickerUrl(id);
  if (!name || !url) return null;
  return (
    <Slot favorite={{ pack: "napp", id }} className="is-cell">
      <button
        type="button"
        className="sticker-cell press"
        title={name}
        aria-label={name}
        onClick={() => onPick({ pack: "napp", id })}
      >
        <img src={url} alt="" draggable={false} />
      </button>
    </Slot>
  );
}

function GiphyTile({
  session,
  item,
  onPick,
}: {
  session: AppSession;
  item: GiphyPickItem;
  onPick: (pick: StickerPick) => void;
}) {
  const { ref, url } = useGiphyUrl(session, item.giphy);
  return (
    <Slot favorite={{ pack: "giphy", ...item }} className="is-tile">
      <button
        ref={ref}
        type="button"
        className={`giphy-tile press ${item.type === "sticker" ? "is-sticker" : ""}`}
        style={{ aspectRatio: `${item.width} / ${item.height}` }}
        title={item.title || undefined}
        aria-label={item.title || (item.type === "gif" ? "GIF" : "Sticker")}
        onClick={() =>
          void picture(session, item.giphy).then(
            ({ blob }) => onPick({ pack: "giphy", item, picture: blob }),
            () => {},
          )
        }
      >
        {url && <img src={url} alt="" draggable={false} />}
      </button>
    </Slot>
  );
}

function PackCell({
  sticker,
  url,
  mine,
  onPick,
  onRemove,
}: {
  sticker: PackSticker;
  url: string | undefined;
  mine: boolean;
  onPick: (pick: StickerPick) => void;
  onRemove?: () => void;
}) {
  return (
    <Slot
      favorite={{ pack: "own", sticker: sticker.id }}
      className="is-cell"
      onRemove={mine ? onRemove : undefined}
    >
      <button
        type="button"
        className="sticker-cell press"
        aria-label="Sticker"
        disabled={!url}
        onClick={() => url && onPick({ pack: "own", sticker, url })}
      >
        {url && <img src={url} alt="" draggable={false} />}
      </button>
    </Slot>
  );
}

const asPickItem = (item: GiphyItem, type: "gif" | "sticker"): GiphyPickItem => ({
  type,
  giphy: item.id,
  title: item.title,
  width: item.width,
  height: item.height,
});

/** A shelf: its cover dimmed, the word over it. */
function Shelf({
  session,
  cover,
  label,
  icon,
  onOpen,
}: {
  session: AppSession;
  cover: string | undefined;
  label: string;
  icon?: ReactNode;
  onOpen: () => void;
}) {
  const { ref, url } = useGiphyUrl(session, cover);
  return (
    <button ref={ref} type="button" className="gif-shelf press" onClick={onOpen}>
      {url && <img src={url} alt="" draggable={false} />}
      <span className="gif-shelf-label">
        {icon}
        {label}
      </span>
    </button>
  );
}

/** Everything starred, newest first, in the shape it was starred in. */
function Favorites({
  session,
  favorites,
  pack,
  packUrls,
  onPick,
}: {
  session: AppSession;
  favorites: ChatFavorite[];
  pack: PackSticker[];
  packUrls: Map<string, string>;
  onPick: (pick: StickerPick) => void;
}) {
  const shown = favorites.filter(
    (one) => one.pack !== "own" || pack.some((sticker) => sticker.id === one.sticker),
  );
  if (!shown.length) return <p className="emoji-none pick-empty">Star a sticker or GIF</p>;
  return (
    <div className="giphy-grid">
      {shown.map((one) => {
        if (one.pack === "giphy")
          return <GiphyTile key={favoriteKey(one)} session={session} item={one} onPick={onPick} />;
        if (one.pack === "napp")
          return <NappCell key={favoriteKey(one)} id={one.id} onPick={onPick} />;
        const sticker = pack.find((s) => s.id === one.sticker)!;
        return (
          <PackCell
            key={favoriteKey(one)}
            sticker={sticker}
            url={packUrls.get(sticker.path)}
            mine={false}
            onPick={onPick}
          />
        );
      })}
    </div>
  );
}

function GiphyResults({
  session,
  favorites,
  pack,
  packUrls,
  onPick,
}: {
  session: AppSession;
  favorites: ChatFavorite[];
  pack: PackSticker[];
  packUrls: Map<string, string>;
  onPick: (pick: StickerPick) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"gif" | "sticker">("gif");
  /** With nothing typed: the shelves, or one of the two that is not a word. */
  const [shelf, setShelf] = useState<"shelves" | "trending" | "favorites">("shelves");
  const [shelves, setShelves] = useState<{ term: string; cover: GiphyItem | null }[]>([]);
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [state, setState] = useState<"loading" | "idle" | "failed">("loading");
  const asked = useRef(0);
  const onShelves = type === "gif" && !query && shelf === "shelves";
  const onFavorites = !query && shelf === "favorites";

  useEffect(() => {
    const stop = new AbortController();
    void giphyCategories(session, stop.signal).then(setShelves, () => {});
    return () => stop.abort();
  }, [session]);

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
    if (onShelves || onFavorites) return;
    const stop = new AbortController();
    const wait = window.setTimeout(() => void load(0, query, stop.signal), query ? 300 : 0);
    return () => {
      window.clearTimeout(wait);
      stop.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type, shelf]);

  const trendingCover = shelves.find((one) => one.cover)?.cover?.id;
  const favoriteCover = favorites.find((one) => one.pack === "giphy");
  const away = Boolean(query) || shelf !== "shelves";

  return (
    <>
      <div className="gif-search-row">
        <label className="emoji-search">
          {away ? (
            <button
              type="button"
              className="gif-back press"
              aria-label="Back"
              onClick={() => {
                setItems([]);
                setQuery("");
                setShelf("shelves");
              }}
            >
              <ChevronLeft size={14} />
            </button>
          ) : (
            <Search size={14} />
          )}
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
        <div className="gif-kind" role="radiogroup" aria-label="Kind">
          {(
            [
              ["gif", "GIFs"],
              ["sticker", "Stickers"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={type === id}
              className={`gif-kind-option press ${type === id ? "is-on" : ""}`}
              onClick={() => {
                setItems([]);
                setType(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {onShelves ? (
        <div className="gif-shelves">
          <Shelf
            session={session}
            cover={favoriteCover?.pack === "giphy" ? favoriteCover.giphy : undefined}
            label="Favorites"
            icon={<Star size={15} />}
            onOpen={() => setShelf("favorites")}
          />
          <Shelf
            session={session}
            cover={trendingCover}
            label="Trending"
            icon={<TrendingUp size={15} />}
            onOpen={() => {
              setItems([]);
              setShelf("trending");
            }}
          />
          {shelves.map((one) => (
            <Shelf
              key={one.term}
              session={session}
              cover={one.cover?.id}
              label={one.term}
              onOpen={() => {
                setItems([]);
                setQuery(one.term);
              }}
            />
          ))}
        </div>
      ) : onFavorites ? (
        <Favorites
          session={session}
          favorites={favorites}
          pack={pack}
          packUrls={packUrls}
          onPick={onPick}
        />
      ) : (
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
            <GiphyTile
              key={item.id}
              session={session}
              item={asPickItem(item, type)}
              onPick={onPick}
            />
          ))}
          {state === "failed" && <p className="emoji-none">GIPHY is not answering</p>}
          {state === "idle" && !items.length && <p className="emoji-none">Nothing found</p>}
        </div>
      )}
      <p className="giphy-attribution">Powered by GIPHY</p>
    </>
  );
}

/** Its natural size, read from the picture itself. */
async function sidesOf(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const sides = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return sides;
}

function PackGrid({
  session,
  pack,
  packUrls,
  onChanged,
  onPick,
}: {
  session: AppSession;
  pack: PackSticker[];
  packUrls: Map<string, string>;
  onChanged: () => void;
  onPick: (pick: StickerPick) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setFailure("");
    try {
      for (const file of files) {
        if (!(file.type in STICKER_TYPES)) throw new Error("Stickers are PNG, WebP, GIF or JPEG");
        if (file.size > STICKER_MAX_BYTES) throw new Error("A sticker can be up to 4 MB");
        const { width, height } = await sidesOf(file);
        await addPackSticker(session, file, file.type, width, height);
      }
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Couldn't add the sticker");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <div className="sticker-grid">
      <button
        type="button"
        className="sticker-cell pack-add press"
        aria-label="Add stickers"
        title="Add stickers"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Plus size={22} />
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={Object.keys(STICKER_TYPES).join(",")}
        onChange={(event) => {
          void add(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {[...pack].reverse().map((sticker) => (
        <PackCell
          key={sticker.id}
          sticker={sticker}
          url={packUrls.get(sticker.path)}
          mine={sticker.ownerId === session.userId}
          onPick={onPick}
          onRemove={() => void removePackSticker(sticker).then(onChanged, onChanged)}
        />
      ))}
      {failure && <p className="emoji-none pick-failure">{failure}</p>}
    </div>
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
  const { chatFavorites } = useWritingPreferences();
  const [pack, setPack] = useState<PackSticker[]>([]);
  const [packUrls, setPackUrls] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    let live = true;
    void loadStickerPack(session)
      .then(async (found) => {
        const urls = found.length
          ? await chatMediaUrls(found.map((one) => one.path))
          : new Map<string, string>();
        if (!live) return;
        setPack(found);
        setPackUrls(urls);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [session, loaded]);

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
            <NappCell key={sticker.id} id={sticker.id} onPick={onPick} />
          ))}
        </div>
      ) : tab === "gif" ? (
        <GiphyResults
          session={session}
          favorites={chatFavorites}
          pack={pack}
          packUrls={packUrls}
          onPick={onPick}
        />
      ) : (
        <PackGrid
          session={session}
          pack={pack}
          packUrls={packUrls}
          onChanged={() => setLoaded((count) => count + 1)}
          onPick={onPick}
        />
      )}
    </>
  );
}
