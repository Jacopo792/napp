# Design

## Authority and disposition

`PRODUCT.md` is the source of truth for users, permissions, capabilities, security boundaries, and product behavior. This document records the durable visual decisions embodied by the shipped interface; it does not add product scope.

> **Status, 2026-08-29 (updated).** This document describes the shipped
> interface. It had fallen behind it in three places, each of which is now
> corrected below: the interface is no longer dark-only, it does carry a
> coloured accent and a theme control, and it does use translucency. Tags were
> removed from the interface on purpose; their storage remains.
>
> The composition rules — three dense desktop panes, three-line catalogue
> titles, honest save state, the separate phone composition, two-step deletion,
> focus and motion rules — all still hold.
>
> One rule is permanent: **no decorative gradient washes.** Soft radial or mesh
> colour fields are banned from this interface. A wallpaper the reader chose is
> not a decorative wash; a gradient we invented for them is.

## Design thesis

The app is a **soft editorial workspace**. The note is the calmest, brightest, and most spacious place on screen; navigation and metadata recede around it. Familiar three-pane navigation stays efficient, but clean layered surfaces, generous pane rounding, fine rules, and restrained shadows replace a rigid productivity grid.

The default world is dark — graphite planes, near-white ink, neutral grey structure —
but it is a default, not the only one. The reader chooses a theme, a preset or their own
three colours, and optionally a wallpaper of their own. What does not change under any of
those choices is the composition: the same panes at the same rhythm, the same hierarchy,
the same hairlines. A theme repaints the interface; it never rearranges it.

## Composition and density

- The desktop keeps its compact mouse-and-keyboard rhythm. The phone is a separate composition, not a narrowed one: it lands on the notes, shows the narrowing currently in force as dismissible chips above the list, and keeps folder maintenance in a sheet over it.
- The primary workspace is three rounded, elevated panes with 12 px breathing room: a sidebar of destinations, a note catalogue, and a flexible editor. The first two are draggable — 210–420 px and 300–620 px, defaulting to 248 and 380 — and the handles stop before either can take the editor below 380 px. All three use a fine border, large radius, clipped contents, and a restrained soft shadow.
- The editor is visually dominant. Its page surface is the quietest layer and its content is centred on the active reading measure, so collapsing the navigation moves title and text together instead of stranding them against the left edge. The measure counts characters of the reading face, and the frontispiece resolves `ch` against that same face so title and body share one column edge. The sidebar and catalogue share a slightly more recessive paper surface; the app background sits on the furthest surface. Both navigation panes can be collapsed together for a full-page writing focus.
- The sidebar is the column of destinations, top to bottom: the scope switch, the scopes and folder tree, the wastebasket at the foot, then Settings and the lock. The switch is built from the archive's roster — your notes, and each other member by nickname — and each account opens on its own scope. Both navigation panes can be hidden together for focused writing. The reading axes live in Settings, next to a specimen that changes under the slider; they are not a bar across the bottom of the note.
- Controls are rounded throughout: pills for identity, rounded rectangles for inputs and actions, and circular slider thumbs. Use borders and surface shifts before adding shadow or saturated colour.

## Surface and colour system

Depth comes from surface steps, complete hairlines and restrained shadow. Chrome
that floats over the note — toolbars, the search field, popovers, sheets — is
allowed translucency and a backdrop blur, and falls back to an opaque `--glass`
plane where the browser has neither. The panes themselves never do: a pane is a
plane, and you must not be able to read the note through the list.

Every colour in the interface is a token. Nothing hard-codes a hex value, because
every one of them is repainted by the reader's theme.

| Token             | Dark default | Role                              |
| ----------------- | ------------ | --------------------------------- |
| `--surface`       | `#131313`    | App ground                        |
| `--paper`         | `#1E1E1E`    | Sidebar and catalogue             |
| `--page`          | `#292929`    | Note surface                      |
| `--ink`           | `#E8E8E8`    | Body text                         |
| `--ink-2`         | `#C7C7C7`    | Secondary text                    |
| `--ink-3`         | `#939393`    | Muted text and list markers       |
| `--ink-4`         | `#747474`    | Metadata only                     |
| `--rule`          | `#3C3C3C`    | Hairline borders                  |
| `--rule-soft`     | `#2F2F2F`    | Hairlines inside a list           |
| `--accent`        | reader's     | Selection, focus, active state    |
| `--accent-strong` | reader's     | Accent text that has to carry     |
| `--accent-wash`   | reader's     | Active-state fill                 |
| `--on-accent`     | reader's     | Text on an accent fill            |
| `--glass`         | `#242424`    | Floating chrome, blur unavailable |
| `--danger`        | `#FFA5A8`    | Error text                        |
| `--danger-fill`   | `#B3272C`    | Destructive button                |
| `--on-danger`     | `#FAFAFA`    | Text on destructive button        |
| `--ok`            | `#7FD1A8`    | Success state only                |
| `--tint-*`        | six          | Text highlight colours            |

**Theme.** `system`, `dark` or `light`, and `color-scheme` follows it so
scrollbars, form controls and browser chrome stay aligned. Four presets ship —
Graphite, Midnight, Aubergine, Paper — and each is only a starting point for the
three values the reader actually sets: accent, background and foreground. A
wallpaper is optional, with its own dim, blur and fit; when one is on, the panes
lean on translucency so the picture is visible without the text sitting on it.

**Governance.** The accent carries ordinary interaction: selection, focus, the
active row, the pressed control. Semantic hue is reserved for danger, success
and the six text highlights, and none of those may be reused for decoration.
Decorative gradients remain banned. A new colour needs a new token and a reason
it cannot be one of these.

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

They live in Settings, each on a native range input beside a specimen that is set with the value the slider currently holds — which is the whole difference between a control you understand and four numbers. Keep native keyboard stepping and screen-reader semantics; the travelled track and the thumb take the accent.

Markdown is edited in one continuous reading surface. Syntax is formatted in place: markers remain visible but muted, headings gain display hierarchy, links carry an accent underline and list markers recede to `--ink-3`, code gains a restrained inset surface, and horizontal-rule source draws a real rule. Links render as interactive reading objects whenever their source line is inactive; returning the caret to that line exposes the editable Markdown. Images never do: their source is an encoded payload, so the widget replaces the Markdown unconditionally, the range is atomic to the caret, and the picture carries its own actions — open full size, or remove whole. The format cluster stands in the editor's own header, optically centred over the measure it acts on, and drops to a row of its own when the pane is too narrow to hold three groups side by side. It offers bold/italic/strike/heading/list/quote/link/code/divider, colour, tables, local image insertion, attachment, translation and “Import PDF as text.” There is no split preview: the reading surface is the editing surface.

## Navigation and interaction states

- The sidebar makes scope separation explicit. The switch is a segmented control built from the archive's roster — "My notes" plus each other member by nickname, one segment per member, with the active one filled; members are shown with avatars and an online indicator while you share presence. Scopes are never presented as blended. The separation is organisational and the permission behind it is recorded in `PRODUCT.md`: every member can read every scope; only editors write.
- Folder selection uses the accent wash, full ink and stable count alignment. Notes can be dragged onto valid folder rows, which show an inset ring while targeted.
- Catalogue rows stay dense. Pinned notes appear first, then every group is ordered by the latest real edit; opening a note never changes its position. Each row leads with a glyph saying what it will open — a checklist, a note carrying a picture, a note carrying a file — then a multiline title, a timestamp, a clipped preview and a pin action. It does not show its own position in the sort: that is a number about the list, not about the note. The selected row uses a page surface, border, and minimal shadow rather than a full-width saturated fill.
- Icon actions are quiet until hover or keyboard focus. Hover shifts them toward the accent wash; destructive actions shift to `--danger`.
- Note deletion is deliberately two-step in place: the first click changes the row action to a visible **Delete?** confirmation, and the second click performs the permanent deletion. The confirmation expires after three seconds. Do not replace this with a one-click destructive icon.

## The right button

Right-click acts on the thing under the pointer: a note row, a folder, the note
page. It opens the same items that thing's own ⋯ already carries — one list
behind two doors, never a second set of actions that exists only here.

The one place it is not ours is the text itself. Inside the editor, the title
field and any other input, the browser's own menu is left alone: it carries
spelling suggestions, Look Up, and a paste that needs no permission, and a web
page cannot put those back. A destructive item asks twice here exactly as it
does on a row.

## Accounts, invitations, roles, avatars and presence

- Signing up is public but confirming is required: the login page toggles between sign-in and sign-up, sign-up shows a neutral "check your email" state without enumerating whether the address could be created, and the first personal archive is created atomically behind `ensure_personal_archive()` with an advisory lock. An account that belongs to several archives picks which one to open; "not connected" only means this account has no membership row for this archive yet.
- An invitation is a one-time link whose raw 64-hex token is shown once for the inviter to copy. The database keeps only the SHA-256 digest for seven days; re-inviting an unclaimed address rewrites the same row. Redemption runs behind a private security-definer function and succeeds only when the caller's `auth.users.email_confirmed_at` is set and lower-cased equals the invited address. The client never resolves an address to a user id and never lists existing addresses as a directory.
- Roles are binary and visible: every member can read every note and list; only editors can write notes, folders, tags, archive settings and `note-images` objects, or create invites and change roles. A viewer sees the same notes and scopes but the editor is read-only and the write menus and actions are inert. Changing another member's role is done through `set_archive_member_role()`, and the last editor cannot be demoted. Storage mirrors the table boundary.
- A member is a person. Settings shows who belongs to the archive, by nickname and join date, and every member's avatar appears in the scope switch and in the sidebar while you are present. The rule stays the same: you may read a peer's `profiles` row and avatar when you share an archive; only the account itself may write its own `profiles` row and upload or delete under `avatars/<your user id>/…`. The avatar URL cache (`src/lib/avatarCache.ts`) keeps one object URL per avatar and Realtime keeps the roster live.
- Presence is off by default and mutual: joining `presence:<archiveId>` with `{ private: true }` happens only while broadcasting `{ userId, onlineAt }`, so there is no listen-only mode in the client and the server enforces the same boundary on `realtime.messages` (`extension = 'presence'`, verified through `private.presence_archive_id()` against `archive_members`). The Settings toggle is per-archive and persisted in `localStorage`. When enabled, online members are indicated on the scope switch and in the member list.

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
