/* The shape of what is coming, instead of the word "Loading…". Bars use the
   app's one `.skeleton` sweep (styles.css), so every placeholder on screen is
   lit by the same passing light; what replaces them fades in with `fade-in`. */

const WIDTHS = [78, 62, 70, 54, 66];

/** Rows of a list: an optional round lead, a title bar and a shorter line. */
export function SkeletonRows({ rows = 3, lead = false }: { rows?: number; lead?: boolean }) {
  return (
    <div className="skeleton-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          {lead && <div className="skeleton skeleton-lead" />}
          <div className="skeleton-lines">
            <div className="skeleton" style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }} />
            <div
              className="skeleton is-short"
              style={{ width: `${WIDTHS[(i + 2) % WIDTHS.length] - 20}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A conversation: bubbles on alternating sides, as the chat lays them out. */
export function SkeletonChat() {
  return (
    <div className="skeleton-chat" role="status" aria-label="Loading">
      {[52, 34, 64, 40].map((width, i) => (
        <div
          key={i}
          className={`skeleton skeleton-bubble${i % 2 ? " is-mine" : ""}`}
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}
