# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Everyone holding a row in `archive_members`. The archive is built for two —
`archives.seat_limit` defaults to `2` and the database refuses the row past it —
and the column accepts `1`–`8`, so a larger group is a value change rather than
a rewrite. Each member has a separate Supabase email/password account and a
confirmed address; membership carries a role, `editor` or `viewer`. Every member can read every note and list in the archive
and use the `viewAs` switch; only editors can write notes, folders, tags,
archive settings and `note-images` objects, create invitations, or change
another member's role. The account is the only access boundary; there is no
separate archive key or passphrase. The last editor cannot be demoted.

`owner_id` names the member a note, folder or tag belongs to. It is an
organisational label and never an authorization boundary: RLS checks membership
(and `editor` for writes) and nothing else. The scope switch is built from the
roster, showing **My notes** for the signed-in account and each other member by
nickname, and each account opens on its own scope. A row whose member is unknown
— written before the column, or left by a deleted account — is filed under the
first scope rather than disappearing.

The retired `u1` / `u2` labels are the shape this replaced. The seat limit is not
a return to them: `u1` and `u2` were two fixed slots baked into every row and
policy, while `seat_limit` is one number counting members of a roster that is
otherwise general. Two people is the current policy; two slots was the old
architecture.

Creating a Supabase Auth account does not join the archive. Until the
`archive_members` row exists the app answers "This account is not connected to
the archive" and the database returns nothing. A new account creates its own
personal archive atomically behind `ensure_personal_archive()` the first time it
signs in, held by an advisory lock so two tabs do not race; an account that
belongs to several archives picks which one to open on sign-in. Joining an
existing archive requires an invitation link: a 64-hex-character one-time token
whose SHA-256 digest is stored for seven days. Claiming checks that the caller's
address lower-cased equals the invited one, then adds the membership. Email
confirmation was turned off on 2026-08-30 — the built-in mail service delivers
only to the project's own team addresses, so it blocked signup instead of
protecting it — which means the address is no longer proof of owning the
mailbox and the one-time token is the whole of the secret — the browser never resolves an
address to a user id. `pnpm add:member` remains as a local administrative path
that writes the row through an existing member's own session, with no
service-role key involved.

## Product Purpose

A private, account-protected place to keep and write notes. Supabase Auth controls
identity, archive-membership RLS controls database access, and private Storage uses the
same membership rule for images and attachments.

Success is that writing in it feels better than the alternatives Jacopo already has
open, so the notes actually land here instead of in Apple Notes.

## Positioning

Account-protected shared notes with a deliberately small backend surface:
Supabase provides identity, RLS, metadata and private files; Yjs/Hocuspocus is
the authoritative live document path; Redis/Valkey connects overlapping server
instances. Search and language processing remain local.

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
- Title and content edits are Yjs updates. The collaboration server persists the
  binary and its readable projections transactionally; metadata remains ordinary
  Postgres writes. Connection state is always visible.

## Capabilities and Constraints

Confirmed functionality: create / edit / delete notes, simultaneous Yjs editing,
pinning, folders, colored tags, full-text search, drag a note onto a folder, the
`viewAs` scope switch every member can use, invitations with a one-time link and
role, a personal-archive bootstrap and multi-archive chooser, per-member nicknames
and private avatars cached as object URLs, and opt-in live presence that is
visible only while broadcasting on a private Realtime channel (`private: true`,
`realtime.messages` extension `presence` restricted to members of
`presence:<archiveId>`). A viewer reads everything but writes nothing in the
archive — including Storage and the invitation / role RPCs — while a personal
avatar remains writable only by its owner. Appearance supports system, light and
dark modes, curated palettes, custom colours and an optional device-local
background image. Opening a note is read-only state selection: it must never
update `updatedAt` or trigger a database write. Typing and then restoring a
note's exact saved contents is not an edit. Notes may also carry a picture of
their own — set from the note's context menu, shown wherever the note is named —
and curated or private uploaded covers with vertical repositioning.

**Editor direction (updated 2026-08-30):** use a structured Tiptap rich-text document
in one reading-and-writing surface, with no Markdown delimiters and no separate preview
tab. A compact, dismissible formatting menu covers common actions; the always-visible
Edit/Live/Preview toolbar remains unwanted. Legacy Markdown is parsed only at the
migration boundary and retained unchanged in `legacy_body`.

PDFs with selectable text may be imported locally into the current note. The browser
extracts the text without uploading the document; OCR and AI document analysis are not
part of this capability.

JPG, PNG, and WebP images may be inserted locally. They are resized and uploaded to a
private, archive-membership-protected Storage bucket; the note stores only a structured
private-image node with an opaque object id. An embedded image remains a reading object:
it opens full size, can be removed whole, and its storage reference is never exposed in
the editor. Choosing a file and pasting from the clipboard use the same upload path.
Legacy Markdown image URLs render in place after conversion, and links plus bare HTTP(S)
URLs become clickable — a plain click opens the target in a new tab, and editing a link
goes through the toolbar's explicit text and URL fields rather than through the caret.

Technical constraints that outlive any design:

- React 19 + TanStack Router + Vite + Tailwind v4 remain unchanged.
- Hocuspocus 4 owns live title/body documents. The client holds one WebSocket
  for the session and multiplexes every note over it, so opening a note costs
  an auth and a sync message rather than a fresh connection. It authenticates
  with its current Supabase access token, the server reauthorizes long-lived
  sockets per document, and Redis/Valkey is the multi-instance bus rather than
  durable storage.
- Supabase Auth public signup is enabled and email confirmation is off (see
  `SECURITY.md` for what that costs). A new account reaches the archive either by
  bootstrapping its own personal archive atomically or by claiming a seven-day
  invitation link addressed to it. Invitations store only a SHA-256 digest, never
  the raw token or a resolvable directory of addresses. Sign-in and account
  creation are separate modes on the login page, each with its own copy and a
  show/hide password control. The confirmation screen remains in the client and
  is shown only when Supabase withholds a session, so turning confirmations back
  on needs no client change — only SMTP and the `email_confirmed_at` check.
- The seat limit lives in the database, not in the interface:
  `private.enforce_archive_seats()` is a `before insert` trigger on
  `archive_members`, and `private.issue_archive_invite()` counts members plus
  live unclaimed invitations before issuing. Settings closes the form on the same
  arithmetic as a courtesy, not as the boundary.
- RLS authorizes every archive row through `archive_members`; `owner` is never a
  security boundary. Members may select; only editors may insert, update or
  delete `archives`, `notes`, `folders`, `tags`, `note_tags` and `note-images`
  objects via `private.can_write_archive(archive_id)` — direct writes to
  `archive_members` are revoked entirely and go through `create_archive_invite`
  / `claim_archive_invite` / `set_archive_member_role`. Storage policies derive
  the archive id from the object path and apply the same membership check; the
  `presence` extension on `realtime.messages` is restricted to
  `presence:<archiveId>` members via `private.presence_archive_id()`, with the
  client joining `config.private = true`. Postgres Changes subscriptions remain
  public channels and are filtered by table RLS.
- Title and body are one Yjs document (`Y.Text("title")` and
  `Y.XmlFragment("default")`). Opening, selecting or focusing a note must not
  write or change timestamps. IndexedDB stores are scoped by archive, account
  and note, and never authorize the editor: a server sync must succeed before
  cached content is shown. Once authorised, an open editor remains usable while
  offline and converges on reconnect.
- Folders, tags, pinning, Trash state, Archive state and tag assignments are
  structural rows. Folder and tag names are ordinary account-protected columns.
- Archive is not Trash. A trashed note is on its way out and is read-only until
  it is restored or deleted for good; an archived note is filed off the folder
  list and stays editable. A note that is both reads as trashed, because the
  more urgent thing to say about it is that it is about to disappear.
- **The one boundary that is not plain membership.** Every member reads every
  scope, with a single exception: a member may set `profiles.hide_archived` and
  their archived notes are then withheld from the others. It is enforced in
  Postgres — `notes_member_select` calls `private.archived_note_visible()`,
  which reads the flag from the owner's own profile row — and it guards update
  and delete alike, so a note you cannot see is not a note you can write. This
  is the only place a policy consults `owner_id`; everywhere else it stays
  organisational. What it is worth is bounded and stated in `SECURITY.md`: the
  other member's client cannot fetch the row, and nothing here is encrypted, so
  it hides a note from a member and never from the database.
- Every member has a `public.profiles` row: a nickname and an optional avatar. You
  may read the profile of anyone you share an archive with, and write only your
  own. A new account gets a nickname from its address on first sign-in. Avatars
  live in the private `avatars` bucket under `<userId>/<objectId>`; only that
  account may write there, while sharing an archive is what lets a peer read the
  picture. The square is chosen before upload — a round window the picture is
  dragged and zoomed behind — not cut from the middle of the file.

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
- No users beyond the archive's own members. No testimonials, metrics, or adoption
  claims exist.

## Product Principles

1. **The words outrank the app.** Every surface that is not the note itself recedes:
   chrome is quiet, the writing area is the brightest and calmest thing on screen.
2. **One scope per member, never blended.** Each member's notes stay a distinct
   organisational view inside one shared archive, and every view is available to
   every authenticated member.
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
