# Design

## Authority and disposition

`PRODUCT.md` is the source of truth for users, permissions, capabilities, security boundaries, and product behavior. This document records the durable visual decisions embodied by the shipped interface; it does not add product scope.

**Finish review disposition: ship.** The desktop composition, typography, hierarchy, interaction states, and light-theme reference in `.impeccable/review/desktop.png` are the accepted visual baseline.

## Design thesis

The app is a **soft editorial workspace**. The note is the calmest, brightest, and most spacious place on screen; navigation and metadata recede around it. Familiar three-pane navigation stays efficient, but clean layered surfaces, generous pane rounding, fine rules, and restrained shadows replace a rigid productivity grid.

The visual world uses pure paper (≈white), charcoal ink, and one azure accent. Azure owns selection, focus, active controls, links, slider progress, and caret color. Sienna and orange are not part of the interface palette and must not be reintroduced as primary, warning, or decorative accents.

## Composition and density

- The product is desktop-only. Preserve its compact mouse-and-keyboard rhythm rather than enlarging controls for touch or collapsing the hierarchy into mobile patterns.
- The primary workspace is three rounded, elevated panes with 12 px breathing room: a fixed 224 px archive/folder/tag rail, a fixed 360 px note catalogue, and a flexible editor. All three use a fine border, large radius, clipped contents, and a restrained soft shadow.
- The editor is visually dominant. Its page surface is the quietest layer and its content is left-aligned to the active reading measure. The rail and catalogue share a slightly more recessive paper surface; the app background and axis controls sit on the furthest surface. Both navigation panes can be collapsed together for a full-page writing focus.
- A compact 56 px top bar carries identity, the current archive switch (My notes / Lisa's notes for u1), theme, and lock controls. A toggle beside the wordmark hides the navigation for focused writing. A separate rounded axis bar anchors the bottom without intruding on the note.
- Controls are rounded throughout: pills for archive identity and tags, rounded rectangles for inputs and actions, and circular slider thumbs. Use borders and surface shifts before adding shadow or saturated color.

## Surface and color system

The surfaces are ordered by proximity to the writing:

| Token           | Light                    | Dark                    | Role                                    |
| --------------- | ------------------------ | ----------------------- | --------------------------------------- |
| `--page`        | `oklch(1 0 0)`           | `oklch(0.26 0.011 255)` | Note and control surface; calmest layer |
| `--paper`       | `oklch(0.982 0.002 255)` | `oklch(0.22 0.01 255)`  | Catalogue, rail, axis bar               |
| `--surface`     | `oklch(0.958 0.004 255)` | `oklch(0.16 0.011 255)` | App ground and recessed controls        |
| `--ink`         | `oklch(0.195 0.014 255)` | `oklch(0.97 0.005 255)` | Primary text                            |
| `--accent`      | `oklch(0.56 0.16 242)`   | `oklch(0.72 0.14 242)`  | Azure interaction accent                |
| `--accent-wash` | `oklch(0.96 0.03 242)`   | `oklch(0.33 0.07 242)`  | Selection and focus support             |
| `--danger`      | `oklch(0.55 0.2 27)`     | `oklch(0.68 0.17 25)`   | Destructive and failed states only      |
| `--ok`          | `oklch(0.5 0.12 155)`    | `oklch(0.72 0.13 158)`  | Confirmed-success state only            |

Light mode steps from a darker warm surround toward a nearly white note. Dark mode reverses the values while preserving the same hierarchy: the writing surface remains the calmest and most legible layer. Rules, muted inks, shadows, and accent values have theme-specific tokens; do not mechanically invert colors.

## Typography

- **Bricolage Grotesque** is the display face for the app name, note title, empty-editor specimen, and rendered Markdown headings. It provides editorial character and uses tighter tracking at display sizes.
- **DM Sans** is the interface face. It carries navigation, controls, note-list titles, and metadata.
- **Source Serif 4 Variable** is the reading face for note body and continuous prose. It provides comfortable long-form reading with optical sizing and variable weight.
- **JetBrains Mono** is reserved for genuine readouts: dates, counts, character totals, save timestamps, shortcut hints, axis values, and code. It is not a decorative all-caps UI voice.
- The note body uses optical sizing and variable weight. Markdown headings use Bricolage at stronger weights and tighter leading; inline code and fences move to JetBrains Mono.
- Long titles are a first-class layout case. Catalogue titles wrap for up to three lines instead of collapsing to a single ellipsis. The editor title wraps freely and its textarea auto-grows to its content; it must never become a fixed-height or horizontally scrolling field.

## Reading and writing

Title, metadata, and body share one left-aligned reading column capped at the active measure. The reading bar controls four real axes through CSS custom properties:

- `--read-size` for body size;
- `--read-measure` for line length;
- `--read-weight` for variable font weight;
- `--read-leading` for line height.

The collapsed bar always shows the current preset or custom state plus the size/measure/weight readout and the save state. Expanding it reveals native range inputs and presets. Keep native keyboard stepping and screen-reader semantics; the travelled track and thumb use azure.

Markdown is edited in one continuous reading surface. Syntax is formatted in place: markers remain visible but muted, headings gain display hierarchy, links and list markers use azure, code gains a restrained inset surface, and horizontal-rule source draws a real rule. A compact Format menu offers bold/italic/strike/heading/list/quote/link/code/divider plus a local “Import PDF as text” action that inserts extracted text without uploading. There is no always-visible toolbar or split preview.

## Navigation and interaction states

- The rail makes archive separation explicit. For the master user, the two archives are a visible segmented switch with a saturated active state; they are never presented as blended or collaborative.
- Folder selection uses an azure wash, azure text, and stable count alignment. Notes can be dragged onto valid folder rows, which show an inset azure ring while targeted.
- Catalogue rows stay dense. Pinned notes appear first, then every group is ordered by the latest real edit; opening a note never changes its position. Each row exposes its current sort position, a multiline title, timestamp, word count, clipped preview, compact tag marks, and a pin action. The selected row uses a page surface, border, and minimal shadow rather than a full-width saturated fill.
- Icon actions are quiet until hover or keyboard focus. Hover shifts them toward the accent wash; destructive actions shift to `--danger`.
- Note deletion is deliberately two-step in place: the first click changes the row action to a visible **Delete?** confirmation, and the second click performs the permanent deletion. The confirmation expires after three seconds. Do not replace this with a one-click destructive icon.

## Honest persistence

Saving is a visible network state, not an implied local success. The bottom bar must distinguish:

- **Unsaved** while changes are waiting for the debounce;
- **Writing** with a small spinner while a commit is in flight;
- **Committed** with the last successful timestamp after persistence;
- **Write failed** in danger color, with the actual error available and the state actionable for retry.

Do not use optimistic “Saved” language before the GitHub write completes, and do not imply conflict merging.

## Accessibility and motion

- Preserve a 2 px azure `:focus-visible` outline with offset on interactive elements. Hover-only actions must also appear on keyboard focus.
- Maintain AA text contrast in both themes, semantic labels for icon controls, pressed/expanded states, native range semantics, and alerts for unlock errors.
- Motion is restrained. Opening a note uses the single authored entrance: a 420 ms fade with a 4 px upward settle. Ordinary state changes use short color transitions; theme switching cross-fades for 180 ms only while the theme is changing.
- Respect `prefers-reduced-motion`: remove page entrance and skeleton pulsing. Never make motion necessary to understand save, selection, or deletion state.
