/* The way into What's New from the foot of the sidebar, beside Settings,
 * in both kinds of archive. A release not read yet is a dot and the word
 * New on the row, which is the one sign somebody looking for "what changed"
 * finds without being told where to look. */
import { Sparkle } from "@/components/icons";

export function WhatsNewButton({ unseen, onOpen }: { unseen: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`sidebar-footer-button press ${unseen ? "is-whats-new" : ""}`}
      onClick={onOpen}
    >
      <span className="sidebar-glyph" data-tone="whats-new">
        <Sparkle size={16} />
      </span>
      <span>What&rsquo;s New</span>
      {unseen && <span className="whats-new-badge ml-auto">New</span>}
    </button>
  );
}
