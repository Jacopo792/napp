# Design

## Authority and disposition

`PRODUCT.md` is the source of truth for users, permissions, capabilities, security boundaries, and product behavior. This document records the durable visual decisions embodied by the shipped interface; it does not add product scope.

> **Status, 2026-08-28 (updated).** This document now describes the shipped
> interface. The blue-charcoal/azure world and the later warm-near-black/sage
> world are both gone; the current palette is chroma-zero graphite with a white
> accent (see *Surface and color system*). The composition rules here — three
> dense desktop panes, three-line catalogue titles, honest save state, the
> separate phone composition, two-step deletion, focus and motion rules — all
> still hold.
>
> One rule is permanent: **no decorative gradient washes.** Soft radial or mesh
> colour fields are banned from this interface.

**Finish review disposition: ship.** The desktop composition, typography, hierarchy, and interaction states are the accepted visual baseline. The palette became dark-only on 2026-08-28; the light-theme reference in `.impeccable/review/desktop.png` is historical and no longer describes the build.

## Design thesis

The app is a **soft editorial workspace**. The note is the calmest, brightest, and most spacious place on screen; navigation and metadata recede around it. Familiar three-pane navigation stays efficient, but clean layered surfaces, generous pane rounding, fine rules, and restrained shadows replace a rigid productivity grid.

The visual world is dark only: neutral graphite grounds ordered by proximity to the writing, near-white ink, and an accent that is white rather than a colour. There is no light palette and no theme control. The chrome is chroma-zero — selection, focus, active controls, links, slider progress, and caret colour are all neutral. Colour appears only in the user's tag chips and in system error/success states; sienna, orange, azure and sage are not part of the interface palette and must not be reintroduced as primary, warning, or decorative accents.

## Composition and density

- The desktop keeps its compact mouse-and-keyboard rhythm. The phone is a separate composition, not a narrowed one: it lands on the notes, carries scope in a single scrolling strip of folder and tag chips, and keeps folder and tag maintenance in a sheet over the list.
- The primary workspace is three rounded, elevated panes with 12 px breathing room: a fixed 224 px archive/folder/tag rail, a fixed 360 px note catalogue, and a flexible editor. All three use a fine border, large radius, clipped contents, and a restrained soft shadow.
- The editor is visually dominant. Its page surface is the quietest layer and its content is centred on the active reading measure, so collapsing the navigation moves title and text together instead of stranding them against the left edge. The measure counts characters of the reading face, and the frontispiece resolves `ch` against that same face so title and body share one column edge. The rail and catalogue share a slightly more recessive paper surface; the app background and axis controls sit on the furthest surface. Both navigation panes can be collapsed together for a full-page writing focus.
- A compact 56 px top bar carries identity, the current archive switch (My notes / Lisa's notes for u1), and the lock control. A toggle beside the wordmark hides the navigation for focused writing. A separate rounded axis bar anchors the bottom without intruding on the note.
- Controls are rounded throughout: pills for archive identity and tags, rounded rectangles for inputs and actions, and circular slider thumbs. Use borders and surface shifts before adding shadow or saturated color.

## Surface and color system

The surfaces are neutral graphite ordered by proximity to the writing. The palette is chroma-zero: it comes from the `--graphite-*` scale in Pixel Services' design tokens (the `neutral` OKLCH ramp, reserved for product previews and control surfaces). The accent is not a colour at all — it is white — so the chrome carries no hue.

| Token           | Value        | Role                                                  |
| --------------- | ------------ | ----------------------------------------------------- |
| `--surface`     | `#131313`    | App ground                                            |
| `--paper`       | `#1E1E1E`    | Rail, catalogue, axis bar                             |
| `--page`        | `#292929`    | Note surface; lightest, calmest plane                 |
| `--ink`         | `#E8E8E8`    | Body text — 11.9:1 on `--page`                        |
| `--ink-2`       | `#C7C7C7`    | Secondary text — 7.6:1 on `--page`                    |
| `--ink-3`       | `#939393`    | Muted text, list markers — 4.7:1 on `--page`         |
| `--ink-4`       | `#747474`    | Metadata only, never body — 3.1:1 on `--page`        |
| `--rule`        | `#3C3C3C`    | Hairline borders                                      |
| `--accent`      | `#FAFAFA`    | White interaction accent (no hue) — 8.3:1 on `--page` |
| `--accent-wash` | `white/10%`  | Active-state fill                                     |
| `--danger`      | `#FFA5A8`    | Error text — 4.6:1 on `--page`                        |
| `--danger-fill` | `#B3272C`    | Destructive button                                    |
| `--on-danger`   | `#FAFAFA`    | Text on destructive button                            |
| `--ok`          | `#7FD1A8`    | Success state only                                    |

The three grounds step upward toward the writing: the app surround is the deepest, the catalogue sits above it, and the note itself is the lightest and calmest layer. Every text pair clears AA — the weakest, `--ink-4` on `--page`, measures 3.1:1 and is reserved for metadata, never body. `color-scheme: dark` is declared on the root so scrollbars, form controls and the browser's own chrome match the page.

**Governance — hue lives only where it carries information.** The chrome is chroma-zero: planes, rules, accent and selection are all neutral. Colour appears in exactly two places — the user's tag chips (the only tints in the interface) and system escalation states, `--danger`/`--danger-fill` for errors and `--ok` for success. Everywhere else, signal is carried by *form* — underline, wash, weight, rule — never by tint. No decorative gradient washes: soft radial or mesh colour fields are banned from this interface.

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

Markdown is edited in one continuous reading surface. Syntax is formatted in place: markers remain visible but muted, headings gain display hierarchy, links carry a white underline and list markers recede to `--ink-3`, code gains a restrained inset surface, and horizontal-rule source draws a real rule. Links render as interactive reading objects whenever their source line is inactive; returning the caret to that line exposes the editable Markdown. Images never do: their source is an encoded payload, so the widget replaces the Markdown unconditionally, the range is atomic to the caret, and the picture carries its own actions — open full size, or remove whole. A compact Format menu offers bold/italic/strike/heading/list/quote/link/code/divider, local image insertion, and “Import PDF as text.” There is no always-visible toolbar or split preview.

## Navigation and interaction states

- The rail makes archive separation explicit. For the master user, the two archives are a visible segmented switch with a saturated active state; they are never presented as blended or collaborative.
- Folder selection uses a white wash, white text, and stable count alignment. Notes can be dragged onto valid folder rows, which show an inset white ring while targeted.
- Catalogue rows stay dense. Pinned notes appear first, then every group is ordered by the latest real edit; opening a note never changes its position. Each row exposes its current sort position, a multiline title, timestamp, word count, clipped preview, compact tag marks, and a pin action. The selected row uses a page surface, border, and minimal shadow rather than a full-width saturated fill.
- Icon actions are quiet until hover or keyboard focus. Hover shifts them toward the accent wash; destructive actions shift to `--danger`.
- Note deletion is deliberately two-step in place: the first click changes the row action to a visible **Delete?** confirmation, and the second click performs the permanent deletion. The confirmation expires after three seconds. Do not replace this with a one-click destructive icon.

## Honest persistence

Saving is a visible network state, not an implied local success. The bottom bar must distinguish:

- **Unsaved** while changes are waiting for the debounce;
- **Writing** with a small spinner while a commit is in flight;
- **Committed** with the last successful timestamp after persistence;
- **Write failed** in danger color, with the actual error available and the state actionable for retry.

Do not use optimistic “Saved” language before the Postgres write completes, and do not imply conflict merging.

## Accessibility and motion

- Preserve a 2 px accent (`:focus-visible`) outline with offset on interactive elements. Hover-only actions must also appear on keyboard focus.
- Maintain AA text contrast, semantic labels for icon controls, pressed/expanded states, native range semantics, and alerts for unlock errors.
- Motion is restrained. Opening a note uses the single authored entrance: a 420 ms fade with a 4 px upward settle. Ordinary state changes use short color transitions. The full-size image view fades its scrim in over 220 ms while the picture settles up from 4 px; the phone's maintenance sheet rises from the bottom edge over 320 ms.
- Respect `prefers-reduced-motion`: remove page entrance and skeleton pulsing. Never make motion necessary to understand save, selection, or deletion state.
