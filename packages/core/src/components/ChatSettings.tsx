/* Settings › Chat: the bubble your messages are sent in, and the six emoji
 * offered first when you react. Both are the account's (`WritingPreferences`),
 * and the bubble is seen by everyone: it is stamped on each message you send. */
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { Search, Volume } from "@/components/icons";
import { ChatBubble } from "@/features/editor/components/ChatBubble";
import "@/features/editor/components/chat.css";
import { CHAT_BUBBLES, type ChatBubble as BubbleId } from "@/lib/chatBubbles";
import { EMOJI_GROUPS, emojiEntries } from "@/lib/emojiCatalog";
import type { WritingPreferences } from "@/lib/writingPreferences";
import { useDismiss } from "./useDismiss";

/** The unfolded set's height; `.emoji-panel` in chat.css. */
const EMOJI_PANEL = 320;

export function ChatSettings({
  preferences,
  onChange,
}: {
  preferences: WritingPreferences;
  onChange: (patch: Partial<WritingPreferences>) => void;
}) {
  /* Changing the bubble sends the preview's message again, so the new one is
     seen arriving the way it will in a chat. */
  const [sent, setSent] = useState(0);
  const [slot, setSlot] = useState<number | null>(null);
  const closePicker = useCallback(() => setSlot(null), []);
  const pickerRef = useDismiss<HTMLDivElement>(slot !== null, closePicker);
  /* The set stays drawn while its drawer closes, so it folds away rather
     than vanishing first. */
  const lastSlot = useRef<number | null>(null);
  if (slot !== null) lastSlot.current = slot;
  const shown = slot ?? lastSlot.current;

  function choose(bubble: BubbleId) {
    if (bubble === preferences.chatBubble) return;
    onChange({ chatBubble: bubble });
    setSent((count) => count + 1);
  }

  /* The settings page scrolls along as the set unfolds, so all of it ends up
     in view without a second gesture. */
  function reveal(from: HTMLElement) {
    const scroller = from.closest<HTMLElement>(".settings-scroll");
    const edit = pickerRef.current;
    if (!scroller || !edit) return;
    const below =
      edit.getBoundingClientRect().bottom +
      EMOJI_PANEL +
      16 -
      scroller.getBoundingClientRect().bottom;
    if (below > 0)
      scroller.scrollTo({
        top: scroller.scrollTop + below,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
  }

  function place(emoji: string) {
    if (slot === null) return;
    const next = [...preferences.quickReactions];
    /* Already among the six: the two trade places rather than repeat. */
    const already = next.indexOf(emoji);
    if (already >= 0) next[already] = next[slot]!;
    next[slot] = emoji;
    onChange({ quickReactions: next });
    /* The set stays open on the same slot: the choice is seen landing, and
       another can be tried without opening it again. */
  }

  return (
    <section className="chat-settings">
      <div className="chat-settings-preview" aria-hidden="true">
        <div className="chat-row is-theirs is-first is-last">
          <div className="chat-line">
            <ChatBubble bubble="ink" mine={false}>
              Are we meeting tonight?
            </ChatBubble>
          </div>
        </div>
        <div key={sent} className={`chat-row is-mine is-first is-last ${sent ? "is-sent" : ""}`}>
          <div className="chat-line">
            <ChatBubble bubble={preferences.chatBubble} mine>
              Yes, at nine 🙂
            </ChatBubble>
          </div>
        </div>
      </div>

      <h3>Bubble</h3>
      <div className="chat-bubble-grid" role="radiogroup" aria-label="Bubble">
        {CHAT_BUBBLES.map((bubble, at) => (
          <button
            key={bubble.id}
            type="button"
            role="radio"
            aria-checked={preferences.chatBubble === bubble.id}
            className="chat-bubble-choice press"
            style={{ "--at": at } as CSSProperties}
            onClick={() => choose(bubble.id)}
          >
            <span className="chat-bubble-sample is-mine">
              <ChatBubble bubble={bubble.id} mine>
                Hi
              </ChatBubble>
            </span>
            <span className="chat-bubble-name">{bubble.name}</span>
          </button>
        ))}
      </div>

      <h3>Quick reactions</h3>
      {/* The six and the emoji to put in them are one place: choosing a slot
          opens the whole set right under it, in the page, as wide as the
          page — no window over a window to aim into. */}
      <div
        ref={pickerRef}
        className="chat-quick-edit"
        data-open={slot !== null || undefined}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || slot === null) return;
          event.stopPropagation();
          setSlot(null);
        }}
      >
        <div className="chat-quick" role="radiogroup" aria-label="Quick reactions">
          {preferences.quickReactions.map((emoji, at) => (
            <button
              key={at}
              type="button"
              role="radio"
              aria-checked={slot === at}
              className={`chat-quick-emoji press ${slot === at ? "is-open" : ""}`}
              aria-label={`Change ${emoji}`}
              onClick={(event) => {
                if (slot === null) reveal(event.currentTarget);
                setSlot((open) => (open === at ? null : at));
              }}
            >
              {/* Keyed by the emoji, so a new one lands rather than appears. */}
              <span key={emoji} className="chat-quick-glyph">
                {emoji}
              </span>
            </button>
          ))}
        </div>
        <div className="chat-quick-drawer" inert={slot === null}>
          <div className="chat-quick-drawer-inner">
            {shown !== null && (
              <div className="emoji-panel" role="dialog" aria-label="Emoji">
                <EmojiPicker
                  chosen={preferences.quickReactions}
                  current={preferences.quickReactions[shown]}
                  onPick={place}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <label className="appearance-row chat-sounds-row">
        <span className="settings-lead" aria-hidden="true">
          <Volume size={16} />
        </span>
        <span className="settings-label">
          <b>Chat sounds</b>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={preferences.chatSounds}
          onChange={(event) => onChange({ chatSounds: event.target.checked })}
        />
      </label>
    </section>
  );
}

export function EmojiPicker({
  chosen,
  current,
  onPick,
}: {
  chosen: string[];
  /** The one being replaced, ringed. */
  current?: string;
  onPick: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const wanted = query.trim().toLocaleLowerCase();
    return EMOJI_GROUPS.map((group) => ({
      ...group,
      entries: emojiEntries(group).filter(
        (entry) => !wanted || entry.words.toLocaleLowerCase().includes(wanted),
      ),
    })).filter((group) => group.entries.length > 0);
  }, [query]);

  return (
    <>
      <label className="emoji-search">
        <Search size={14} />
        <input
          autoFocus
          value={query}
          placeholder="Search"
          aria-label="Search emoji"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && groups[0]) onPick(groups[0].entries[0]!.emoji);
          }}
        />
      </label>
      {!query && (
        <nav className="emoji-groups" aria-label="Groups">
          {EMOJI_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className="emoji-group-jump press"
              title={group.name}
              aria-label={group.name}
              onClick={() =>
                gridRef.current
                  ?.querySelector(`[data-group="${group.id}"]`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
            >
              {emojiEntries(group)[0]!.emoji}
            </button>
          ))}
        </nav>
      )}
      <div ref={gridRef} className="emoji-grid-scroll">
        {groups.length === 0 && <p className="emoji-none">No emoji</p>}
        {groups.map((group) => (
          <div key={group.id} data-group={group.id}>
            <p className="emoji-group-name">{group.name}</p>
            <div className="emoji-grid">
              {group.entries.map(({ emoji, words }) => (
                <button
                  key={emoji}
                  type="button"
                  title={words.split(" ")[0]}
                  className={`emoji-cell press ${chosen.includes(emoji) ? "is-chosen" : ""} ${
                    emoji === current ? "is-current" : ""
                  }`}
                  onClick={() => onPick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
