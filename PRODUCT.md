# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people, and only two, with separate Supabase email/password accounts and full
read/write access to one shared archive. The account is the only access boundary;
there is no separate archive key or passphrase. Both can use the `viewAs` switch.

`owner: "u1" | "u2"` remains a live organisational label. It powers **Jacopo /
Lisa**, and folders and tags carry the same owner label, but it is never an
authorization boundary. RLS checks only membership in the shared archive.
Jacopo's account opens on `u1`; Lisa's account opens on `u2`. Either person can still
switch views manually.

## Product Purpose

A private, account-protected place to keep and write notes. Supabase Auth controls
identity, archive-membership RLS controls database access, and private Storage uses the
same membership rule for images and attachments.

Success is that writing in it feels better than the alternatives Jacopo already has
open, so the notes actually land here instead of in Apple Notes.

## Positioning

Account-protected shared notes with a deliberately small backend surface: Supabase
Auth, Postgres, Realtime and private Storage provide identity, persistence and sync,
while search and content processing remain local.

## Operating Context

- **Two real surfaces** (updated 2026-08-28). The desktop window is wide, driven by
  mouse and keyboard, and stays the surface the density is tuned for. The phone is no
  longer an afterthought: it is used for reading and quick capture, so it gets its own
  composition rather than a narrowed copy of the desktop one — notes first, folders and
  tags as scope rather than as a screen to pass through.
- Sessions are long and reading-heavy, not stack-of-index-cards quick capture. The
  real corpus (observed in Jacopo's Apple Notes, 2026-08-27) is long-form study and
  research material in Italian: multi-section research maps, aphorism collections,
  vocabulary lists, technical snippets.
- **Titles are long.** Real examples run to 55+ characters
  (`MAPPA 5: SK GROUP (il chaebol che ha catturato i pezzi giusti)`). A note list that
  truncates titles to one short line destroys the user's own naming scheme.
- Content language is Italian; the interface language is English today.
- Saves are Postgres row writes and cross-device changes arrive through Realtime.
  Persistence is still network-bound, so save state remains a visible fact.

## Capabilities and Constraints

Confirmed functionality: create / edit / delete notes, fast debounced autosave,
pinning, folders, colored tags, full-text search, drag a note onto a folder,
and u1's `viewAs` archive switch. Appearance supports system, light and dark modes,
curated palettes, custom colours and an optional device-local background image. Opening
a note is read-only state selection: it must never update `updatedAt` or trigger a
database write.

**Editor direction (updated 2026-08-27):** keep the _invisible markdown_ editor in the
Bear model — markdown syntax renders as formatting while you type in one pane, with no
separate preview tab. A compact, dismissible formatting menu is now wanted for common
Markdown actions; the always-visible Edit/Live/Preview toolbar remains unwanted.

PDFs with selectable text may be imported locally into the current note. The browser
extracts the text without uploading the document; OCR and AI document analysis are not
part of this capability.

JPG, PNG, and WebP images may be inserted locally. They are resized and uploaded to a
private, archive-membership-protected Storage bucket; the note stores only a
`napp-image:<uuid>` reference. An embedded image remains a reading object: it opens full
size, can be removed whole, and its storage reference is never exposed in the editor.
Markdown image URLs render in place, and Markdown links plus bare HTTP(S) URLs become
clickable when their source line is not being edited. Link insertion uses explicit text
and URL fields instead of leaving an editable Markdown placeholder in the note.

Technical constraints that outlive any design:

- React 19 + TanStack Router + Vite + Tailwind v4 remain unchanged.
- Supabase Auth uses two pre-created email/password accounts; public signup is disabled.
- RLS authorizes every database row through `archive_members`; `owner` is never a
  security boundary. Storage policies derive the archive id from the object path and
  apply the same membership check.
- Concurrent edits remain last-write-wins at note granularity. The `version` column
  provides optimistic concurrency; the interface must never imply a merge happened.
- Folders, tags, pinning, Trash state and tag assignments are structural rows. Folder
  and tag names are ordinary account-protected columns, and `owner` remains
  organisational only.

## Brand Commitments

The interface uses the operating system's native sans-serif and monospace faces for the
sharpest platform rendering. Graphite remains the default; neutral borders, restrained
radii and `--ease-premium` remain the visual foundation across custom themes.

Custom accent and background colours are user-controlled. Tags, destructive states and
success states retain their semantic meaning in every palette.

## Evidence on Hand

- Real note corpus readable via the Apple Notes connector — use it to size titles,
  previews, and reading measure honestly. Do not invent placeholder note content that
  is shorter or tidier than the real thing.
- No logo, no wordmark, no brand imagery exists for this app. Do not fabricate one.
- No users beyond the two. No testimonials, metrics, or adoption claims exist.

## Product Principles

1. **The words outrank the app.** Every surface that is not the note itself recedes:
   chrome is quiet, the writing area is the brightest and calmest thing on screen.
2. **Two labelled scopes, never blended.** u1 and u2 remain distinct organisational
   views inside one shared archive, available to both authenticated members.
3. **Honest about the network.** Saving is a database write and can fail. Show real
   save state; never fake instant persistence.
4. **Built for long notes and long titles.** Density decisions are validated against
   real 55-character titles and multi-screen bodies, not against synthetic short data.
5. **Dense on the desk, direct on the phone.** The wide screen is a licence to be
   dense, precise, and shortcut-driven. The phone earns the opposite: the fewest
   screens between opening the app and reading or writing a note.

## Accessibility & Inclusion

No user-specific requirement established. Baseline still applies: visible focus rings,
AA contrast on text and on both themes, and `prefers-reduced-motion` respected — the
existing code already honors all three and must keep doing so.
