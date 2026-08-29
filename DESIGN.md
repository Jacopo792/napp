# Design

## Authority and disposition

`PRODUCT.md` is the source of truth for users, permissions, capabilities, security boundaries, and product behavior. This document records the durable visual decisions embodied by the shipped interface; it does not add product scope.

> **Status, 2026-08-28 (updated).** This document now describes the shipped
> interface. The current palette is neutral graphite with near-white type and
> restrained semantic tag colours (see _Surface and color system_). The composition rules here — three
> dense desktop panes, three-line catalogue titles, honest save state, the
> separate phone composition, two-step deletion, focus and motion rules — all
> still hold.
>
> One rule is permanent: **no decorative gradient washes.** Soft radial or mesh
> colour fields are banned from this interface.

**Finish review disposition: reviewed after the rendering pass.** The desktop composition,
hierarchy and interaction states remain the baseline; the palette stays dark while type
rendering is deliberately native.

## Design thesis

The app is a **soft editorial workspace**. The note is the calmest, brightest, and most spacious place on screen; navigation and metadata recede around it. Familiar three-pane navigation stays efficient, but clean layered surfaces, generous pane rounding, fine rules, and restrained shadows replace a rigid productivity grid.

The visual world is dark only: opaque graphite planes, near-white ink and neutral gray
structure. There is no coloured product accent and no theme control. Decorative colour
washes are not part of the interface.

## Composition and density

- The desktop keeps its compact mouse-and-keyboard rhythm. The phone is a separate composition, not a narrowed one: it lands on the notes, carries scope in a single scrolling strip of folder and tag chips, and keeps folder and tag maintenance in a sheet over the list.
- The primary workspace is three rounded, elevated panes with 12 px breathing room: a fixed 224 px archive/folder/tag rail, a fixed 360 px note catalogue, and a flexible editor. All three use a fine border, large radius, clipped contents, and a restrained soft shadow.
- The editor is visually dominant. Its page surface is the quietest layer and its content is centred on the active reading measure, so collapsing the navigation moves title and text together instead of stranding them against the left edge. The measure counts characters of the reading face, and the frontispiece resolves `ch` against that same face so title and body share one column edge. The rail and catalogue share a slightly more recessive paper surface; the app background and axis controls sit on the furthest surface. Both navigation panes can be collapsed together for a full-page writing focus.
- A compact 56 px top bar carries identity, the current archive switch (Jacopo / Lisa), and the lock control. Each account initially selects its namesake view, while the switch remains available. A toggle beside the wordmark hides the navigation for focused writing. A separate rounded axis bar anchors the bottom without intruding on the note.
- Controls are rounded throughout: pills for archive identity and tags, rounded rectangles for inputs and actions, and circular slider thumbs. Use borders and surface shifts before adding shadow or saturated color.

## Surface and color system

The surfaces are fully opaque graphite planes. Depth comes from complete neutral hairlines,
small surface steps and restrained shadow, never backdrop blur or translucent pane
compositing. White is the interaction, selection and focus colour.

| Token           | Value       | Role                        |
| --------------- | ----------- | --------------------------- |
| `--surface`     | `#131313`   | App ground                  |
| `--paper`       | `#1E1E1E`   | Rail and catalogue          |
| `--page`        | `#292929`   | Note surface                |
| `--ink`         | `#E8E8E8`   | Body text                   |
| `--ink-2`       | `#C7C7C7`   | Secondary text              |
| `--ink-3`       | `#939393`   | Muted text and list markers |
| `--ink-4`       | `#747474`   | Metadata only               |
| `--rule`        | `#3C3C3C`   | Hairline borders            |
| `--accent`      | `#FAFAFA`   | Selection and focus         |
| `--accent-wash` | `white/10%` | Active-state fill           |
| `--danger`      | `#FFA5A8`   | Error text                  |
| `--danger-fill` | `#B3272C`   | Destructive button          |
| `--on-danger`   | `#FAFAFA`   | Text on destructive button  |
| `--ok`          | `#7FD1A8`   | Success state only          |

The near-black app surround separates the three graphite panes without tinting their content.
`color-scheme: dark` keeps scrollbars, form controls and browser chrome aligned.

**Governance.** White and neutral gray carry ordinary interaction. Only tags, destructive
states and success states retain semantic hue. Decorative gradients remain banned.

## Typography

- The native system sans-serif carries display, interface and reading text with grayscale antialiasing for crisp rendering on dark surfaces.
- The native system monospace is reserved for genuine readouts and code.
- Weight is expressed through normal CSS `font-weight`, not explicit variable-font optical axes.
- Long titles are a first-class layout case. Catalogue titles wrap for up to three lines instead of collapsing to a single ellipsis. The editor title wraps freely and its textarea auto-grows to its content; it must never become a fixed-height or horizontally scrolling field.

## Reading and writing

Title, metadata, and body share one left-aligned reading column capped at the active measure. The reading bar controls four real axes through CSS custom properties:

- `--read-size` for body size;
- `--read-measure` for line length;
- `--read-weight` for reading weight;
- `--read-leading` for line height.

The collapsed bar always shows the current preset or custom state plus the size/measure/weight readout and the save state. Expanding it reveals native range inputs and presets. Keep native keyboard stepping and screen-reader semantics; the travelled track and thumb use white.

Markdown is edited in one continuous reading surface. Syntax is formatted in place: markers remain visible but muted, headings gain display hierarchy, links carry a white underline and list markers recede to `--ink-3`, code gains a restrained inset surface, and horizontal-rule source draws a real rule. Links render as interactive reading objects whenever their source line is inactive; returning the caret to that line exposes the editable Markdown. Images never do: their source is an encoded payload, so the widget replaces the Markdown unconditionally, the range is atomic to the caret, and the picture carries its own actions — open full size, or remove whole. A compact Format menu offers bold/italic/strike/heading/list/quote/link/code/divider, local image insertion, and “Import PDF as text.” There is no always-visible toolbar or split preview.

## Navigation and interaction states

- The rail makes archive separation explicit. For the master user, the two archives are a visible segmented switch with a saturated active state; they are never presented as blended or collaborative.
- Folder selection uses a neutral wash, white text and stable count alignment. Notes can be dragged onto valid folder rows, which show an inset white ring while targeted.
- Catalogue rows stay dense. Pinned notes appear first, then every group is ordered by the latest real edit; opening a note never changes its position. Each row exposes its current sort position, a multiline title, timestamp, word count, clipped preview, compact tag marks, and a pin action. The selected row uses a page surface, border, and minimal shadow rather than a full-width saturated fill.
- Icon actions are quiet until hover or keyboard focus. Hover shifts them toward the accent wash; destructive actions shift to `--danger`.
- Note deletion is deliberately two-step in place: the first click changes the row action to a visible **Delete?** confirmation, and the second click performs the permanent deletion. The confirmation expires after three seconds. Do not replace this with a one-click destructive icon.

## Honest persistence

Saving is a visible network state, not an implied local success. The editor
toolbar must distinguish:

- **Unsaved** while changes are waiting for the debounce;
- **Saving** with a small spinner while a commit is in flight;
- **Saved** with the last successful timestamp after persistence;
- **Updated elsewhere** when another member's write arrives over Realtime;
- **Save failed** in danger color, with the actual error available and the state actionable for retry.

Say “Saved” only once the Postgres write has completed — never ahead of it, and
never as a local-only reassurance. Before it completes the state is **Unsaved**
or **Saving**. The wording stays in the user's vocabulary: no “committed”, no
“write”, no other borrowing from version control or from the database. Do not
imply conflict merging.

The readout occupies a slot of one fixed width, sized to the longest state, and
the states differ enough in length that any other arrangement makes the label
slide horizontally on every debounce. Anything unbounded — a server error string
above all — belongs in the tooltip, not in the row.

## Accessibility and motion

- Preserve a 2 px accent (`:focus-visible`) outline with offset on interactive elements. Hover-only actions must also appear on keyboard focus.
- Maintain AA text contrast, semantic labels for icon controls, pressed/expanded states, native range semantics, and alerts for unlock errors.
- Motion is restrained. Opening a note uses the single authored entrance: a 420 ms fade with a 4 px upward settle. Ordinary state changes use short color transitions. The full-size image view fades its scrim in over 220 ms while the picture settles up from 4 px; the phone's maintenance sheet rises from the bottom edge over 320 ms.
- Respect `prefers-reduced-motion`: remove page entrance and skeleton pulsing. Never make motion necessary to understand save, selection, or deletion state.
