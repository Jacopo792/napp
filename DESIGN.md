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
- The primary workspace is three **flush columns** divided by a hairline, under one band of chrome that runs the width of the window: a sidebar of destinations, a note catalogue, and a flexible editor. It was three rounded cards floating on a ground with ten pixels of air around and between them, which is a good look and is not what a Mac application looks like — Finder, Mail and Notes are flush columns, and of everything here that read as a web page in a frame the floating cards read loudest. The columns carry no border and no radius: with the panes touching, a 1 px border pushed each column's contents down by a pixel, so the three 52 px header strips disagreed about where they ended and the line across the window was drawn at two heights.
- The seam between two columns is the resizer, and it is one pixel wide. What you can grab is a pseudo-element nine pixels wider that overhangs both neighbours — a hairline you have to hit exactly is a hairline nobody moves. The two navigation columns are draggable, 210–420 px and 300–620 px, defaulting to 248 and 380, and the handles stop before either can take the editor below 380 px. The _shown_ widths are clamped to the room the window actually has while the stored ones are left alone, so shrinking the window takes the difference back off the panes rather than out of the note, and widening it puts them back where they were.
- The second row of the two navigation columns sits on one line: the scope switch and the search field are both 44 px, both start 12 px under the header band, and both columns begin scrolling at the same y. Two controls of different shapes 12 px out of step is enough to read the whole top of the window as crooked.
- The editor is visually dominant. Its page surface is the quietest layer and its content is centred on the active reading measure, so collapsing the navigation moves title and text together instead of stranding them against the left edge. The measure counts characters of the reading face, and the frontispiece resolves `ch` against that same face so title and body share one column edge. The sidebar and catalogue share a slightly more recessive paper surface; the app background sits on the furthest surface. Both navigation panes can be collapsed together for a full-page writing focus.
- The sidebar is the column of destinations, top to bottom: the scope switch, the scopes and folder tree, then the archive and the wastebasket together at the foot, then Settings and the lock. Both feet are places a note leaves the folders for, and the one you can come back from stands first. The switch is built from the archive's roster — your notes, and each other member by nickname — and each account opens on its own scope. Both navigation panes can be hidden together for focused writing. The reading axes live in Settings, next to a specimen that changes under the slider; they are not a bar across the bottom of the note.
- Controls are rounded throughout: pills for identity, rounded rectangles for inputs and actions, and circular slider thumbs. Use borders and surface shifts before adding shadow or saturated colour.
- Settings has one row shape and every row uses it: a 34 px lead glyph, the name with a line of explanation, the control flush right. The profile picture is a row like the rest, so all four labels start at one x and all four values end at another. A card of rows and a paragraph of prose are different levels and may start at different insets; two cards of rows may not.

## Surface and colour system

Depth comes from surface steps, complete hairlines and restrained shadow. Chrome
that floats over the note — toolbars, the search field, popovers, sheets — is
allowed translucency and a backdrop blur, and falls back to an opaque `--glass`
plane where the browser has neither. The panes themselves never do: a pane is a
plane, and you must not be able to read the note through the list.

Three rules follow from having a wallpaper behind all of it:

- **Shadow is contact, not atmosphere.** `--shadow-soft` is a hairline directly
  under the edge plus a wider pass pulled back by a negative spread. A 40 px
  blur spread evenly around a rounded card reads as soot ringing it, not lift.
- **A band inside a translucent pane takes neither the tint nor the blur again.**
  Two coats of `--paper` is what made every toolbar a darker strip across the top
  of its own column, and a second `backdrop-filter` is a full compositing pass
  per frame for output the eye cannot tell from one.
- **Recesses tint, they do not plate.** The scope switch used to paint opaque
  `--surface`, darker than the column holding it, which over a picture is a black
  rectangle with a hard edge. It is a partial mix now, so the recess comes from
  the ink and the atmosphere still passes through.

Every colour in the interface is a token. Nothing hard-codes a hex value, because
every one of them is repainted by the reader's theme.

| Token             | Dark default | Role                              |
| ----------------- | ------------ | --------------------------------- |
| `--surface`       | `#131313`    | App ground                        |
| `--paper`         | `#1E1E1E`    | Sidebar and catalogue             |
| `--page`          | `#292929`    | Note surface                      |
| `--ink`           | `#E8E8E8`    | Body text                         |
| `--ink-2`         | `#C7C7C7`    | Secondary text                    |
| `--ink-3`         | `#b0b0b0`    | Muted text and list markers       |
| `--ink-4`         | `#999999`    | Icons and large labels only       |
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

**The muted inks have a floor.** `--ink-3` holds 4.5:1 and `--ink-4` 3:1, and
both are measured against `--paper` rather than against the note page —
counter-intuitively `--paper` is the _lighter_ of the two on the default theme,
so the densest text in the window sits on the lowest contrast in it. Four
distinct tiers below `--ink` do not fit above 4.5:1 on that ground, which is
why `--ink-4` is for an icon or a large label and never for a sentence. A
control that is not disabled must not be drawn as though it were: idle glyphs
on a note row are `--ink-3` and visible without the pointer, not revealed by it.

**Theme.** `system`, `dark` or `light`, and `color-scheme` follows it so
scrollbars, form controls and browser chrome stay aligned. Nine presets ship —
Ink, Graphite, Midnight, Aubergine, Paper, Fjord, Moss, Indigo, Solar — and
eight of the nine are dark, because `setTheme()` still replaces a reader's three
colours whenever the THEME segment is touched, so a light preset is wiped by the
click that selects its own theme. Each is only a starting point for the
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

Tiptap edits a structured document in one continuous reading surface. There are no source markers: headings, links, lists, code, dividers, colours, tables and checklists are first-class nodes or marks. Private images and attachments are atomic reading objects whose storage ids are never exposed; each carries its own open, download or remove actions. The format cluster stands in the editor's own header, optically centred over the measure it acts on, and drops to a row of its own when the pane is too narrow to hold three groups side by side. It offers bold/italic/strike/heading/list/quote/link/code/divider, colour, tables, local image insertion, attachment, translation and “Import PDF as text.” A link in the document is a link: a plain click opens it in a new tab, and it is edited through the toolbar's fields rather than by putting a caret inside it. A table menu inserts a grid or deletes the selected cell's row, column or complete table. There is no split preview: the reading surface is the editing surface. Legacy Markdown exists only at the migration boundary.

## Navigation and interaction states

The compact avatar switch keeps its portrait sizes. When the sidebar header has
at least 230 px of content width (after the macOS traffic-light gutter), the
selected member's name appears beside it, truncated if necessary. Folder and
sidebar controls stay anchored at the right; pane widths and type sizes do not
change. Desktop list rows use 4 px of left padding instead of 12 px, with their
separators shifted by the same 8 px; gallery and mobile rows keep their spacing.

- The sidebar makes scope separation explicit. The switch is a segmented control built from the archive's roster — "My notes" plus each other member by nickname, one segment per member, with the active one filled; members are shown with avatars and an online indicator while you share presence. Scopes are never presented as blended. The separation is organisational and the permission behind it is recorded in `PRODUCT.md`: every member reads and writes every scope. Below the folder tree the rail carries the places a note leaves it for — Remarks, Archive and Trash. Remarks holds the notes with a conversation nobody has resolved, and it is the one row that can carry a badge: what the other member has said, in an open thread, since **this account** last looked. The badge says how many are waiting; a dot on the leading slot of a catalogue row says which notes they are on, because a count with nothing findable under it is a count the reader has no way to answer. Looking at the list is not reading — only opening the note moves its line.
- Folder selection uses the accent wash, full ink and stable count alignment. Notes can be dragged onto valid folder rows, which show an inset ring while targeted.
- Catalogue rows stay dense. Pinned notes appear first, then every group is ordered by the latest real edit; opening a note never changes its position. Each row leads with a glyph saying what it will open — a checklist, a note carrying a picture, a note carrying a file — then a multiline title, a timestamp, a clipped preview and a pin action. It does not show its own position in the sort: that is a number about the list, not about the note. The selected row uses a page surface, border, and minimal shadow rather than a full-width saturated fill.
- Icon actions are quiet until hover or keyboard focus. Hover shifts them toward the accent wash; destructive actions shift to `--danger`.
- Note deletion is deliberately two-step in place: the first click changes the row action to a visible **Delete?** confirmation, and the second click performs the permanent deletion. The confirmation expires after three seconds. Do not replace this with a one-click destructive icon.
- Note actions are explicit. Pointer users have the row's right-click menu;
  touch users have compact Pin, Archive, Restore and Trash controls. Deletion
  remains two-step in every surface, and no swipe can file or remove a note.

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

- Signing in and creating an account are two things, not two moods of one thing. The login card carries a pair of tabs at the top, and the heading, the sub-line, the submit label and the footnote all belong to the tab showing; both fields can reveal what was typed. Confirmation is required, and the confirmation state is a numbered account of what happens next — the link proves the address, signing in comes after it, and the archive is made then — rather than a single neutral sentence. It still does not enumerate whether the address could be created. The first personal archive is created atomically behind `ensure_personal_archive()` with an advisory lock. An account that belongs to several archives picks which one to open; "not connected" only means this account has no membership row for this archive yet.
- Members and invitations are their own Settings section, not a tail on Security. It opens on the seat count, then the roster, then any invitation waiting to be claimed with the seat it holds and a way to withdraw it, then the form. When the seats are full the form is replaced by a row in the same card shape saying so, because a disabled form is a worse explanation than a sentence.
- An invitation is a one-time link whose raw 64-hex token is shown once. The database keeps only the SHA-256 digest for seven days; re-inviting an unclaimed address rewrites the same row. The client never resolves an address to a user id and never lists existing addresses as a directory. The finished link is offered two ways in the same place — copied, or handed to a `mailto:` the member's own mail app composes — because the collaboration service has no outbound-mail role and must never receive the token.
- There is no lesser member: everybody in the archive reads and writes every note, folder and file, and the interface asks for no role when it invites somebody. What one member takes back from another is a single note or a single passage, and it is taken from the note itself — **Only I may write this** in the ⋯ menu the note's other actions live in, or the lock in the selection toolbar. A locked note is read-only to everybody else and says whose it is where the mode label sits; a locked passage is tinted, and the one somebody else holds refuses the caret. Storage mirrors the table boundary.
- A member is a person. Settings shows who belongs to the archive, by nickname and join date, and every member's avatar appears in the scope switch and in the sidebar while you are present. A picture is _placed_, not cropped for you: a round window over the image, dragged and zoomed, and what the window shows is exactly the square that is uploaded. A centre crop is right for a portrait and wrong for everything else. The rule stays the same: you may read a peer's `profiles` row and avatar when you share an archive; only the account itself may write its own `profiles` row and upload or delete under `avatars/<your user id>/…`. The avatar URL cache (`packages/core/src/lib/avatarCache.ts`) keeps one object URL per avatar and Realtime keeps the roster live.
- Presence is off by default and mutual: joining `presence:<archiveId>` with `{ private: true }` happens only while broadcasting `{ userId, onlineAt, noteId, typing }`, so there is no listen-only mode in the client and the server enforces the same boundary on `realtime.messages` (`extension = 'presence'`, verified through `private.presence_archive_id()` against `archive_members`). The Settings toggle is per-archive and persisted in `localStorage`. When enabled, online members are indicated on the scope switch and in the member list.
- Who else is on the _note_ is asked of Yjs awareness rather than of the presence channel, and it is answered on the right of the editor toolbar, beside the save readout — state about the note, where the mode label opposite it is about you. The pill carries a portrait and a caret while they type, and no name: sharing that side with the readout and two buttons leaves a name some fifty pixels short of legible, and a name crushed to a sliver is worse than a portrait that never promised one. The name is on the tooltip and in the screen-reader line.

## Honest persistence

The editor toolbar describes the collaboration connection, not an obsolete
client-side save queue:

- **Connecting** until the server has authorized and synchronized the document,
  with the body carrying three pulsing bars on the measure the text is about to
  use. The title paints from the draft store the moment a note is clicked and
  the body cannot, and a title standing over nothing reads as broken rather
  than busy;
- **Live** while the Hocuspocus connection is current;
- **Offline** after an authorized editor loses the connection, with a tooltip
  saying changes remain on this device and synchronize on reconnect;
- **Unavailable** when the server refuses the note, with the reason available.

Metadata operations such as moving, pinning, covers and photos keep their own
Saving/Save failed feedback where the action happens. Opening, selecting,
focusing or moving the caret is never presented as a save and must never change
the note timestamp.

The readout occupies one stable slot. Unbounded refusal or server error text
belongs in a tooltip or alert, never in the toolbar row.

## The window, when it is a window

The same application runs in a browser tab and in a desktop window, and it is
one interface — the desktop shell adds nothing to it and forks nothing in it.
What it does add is the handful of things a window has and a page does not, and
leaving them out is what makes an Electron app read as a web page in a frame:

- **Platform-native chrome.** macOS keeps the application menu in the system
  menu bar, where archive commands press the same shortcuts the renderer
  answers to. Windows has a single compact title bar coloured from Napp's active
  palette, with no separate File/Edit strip or package-name label. Keyboard
  shortcuts remain identical on both platforms.
- **A gutter for the three traffic lights**, held open in the leftmost header
  strip and following it when the navigation collapses, and released again in
  full screen where the buttons are not there. The lights are moved to the
  middle of the 52 px strip to meet it; the two numbers are one decision in two
  files and changing either alone puts the buttons over the avatar or in a gap.
- **Somewhere to drag the window by.** A hidden title bar leaves none, and there
  is no default: the header strips are the title bar, so they drag, and
  everything pressable in them opts out — menus included, since a menu opened
  from a toolbar is a descendant of it.
- **A window named after what is open in it**, because that name is what Mission
  Control, the Window menu and ⌘Tab have to go on.
- **An icon cut to the platform's template** — on macOS, 824 of artwork centred
  in 1024 with transparent corners and a superellipse edge, so it reads at the
  same size as everything beside it in the Dock — carrying the count of remarks
  nobody here has read.

None of these change the interface. They are the difference between an
application and a page that has been given a frame.

## Accessibility and motion

- Preserve a 2 px accent (`:focus-visible`) outline with offset on interactive elements. Hover-only actions must also appear on keyboard focus.
- Maintain AA text contrast, semantic labels for icon controls, pressed/expanded states, native range semantics, and alerts for unlock errors.
- Motion is restrained. Opening a note uses the single authored entrance: a 420 ms fade with a 4 px upward settle. Ordinary state changes use short color transitions. The full-size image view fades its scrim in over 220 ms while the picture settles up from 4 px; the phone's maintenance sheet rises from the bottom edge over 320 ms.
- Respect `prefers-reduced-motion`: remove page entrance and skeleton pulsing. Never make motion necessary to understand save, selection, or deletion state.
- Animate `transform` and `opacity`, and nothing else that runs per frame. A scaled entrance on text re-rasterises every glyph, and `filter: blur(0)` still promotes a layer and still costs a pass — the wallpaper declares `filter: none` when there is no blur rather than a blur of zero.
