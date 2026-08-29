# Changelog

This file records user-visible changes and security-relevant architecture
changes. The commit history remains the detailed engineering record.

## Unreleased

### Fixed

- **Text lost when two people wrote in the same note.** `saveNote` wrote
  conditionally on the `version` column and then defeated it: a conditional
  update that matched nothing — the signal that somebody else had written — made
  it re-read the current version and rewrite the same payload on top, up to four
  times. Two people in one note overwrote each other silently, with no error
  anywhere, and an image upload took the whole document with it like any other
  write. A miss is a conflict now, and colliding writes are merged by top-level
  block so both people keep their text; when both edited the same block the
  remote version stays in the note and the local one is kept as
  `"<title> — your version"`. The readout says `Merged` or `Kept a copy`. This
  reverses the last-write-wins decision of 2026-08-27, which had accepted a rare
  loss and turned out not to be rare.
- **A new note used to split in two the moment both people used it.** A fresh
  note is one empty paragraph, so two people opening one to talk both typed into
  the same block, and the merge called that a conflict and made a copy. Filling
  a blank block from two sides is two people writing, not a conflict: both texts
  are kept, in order, in the one note. Rewriting the same block when it actually
  held something is still a conflict, and still keeps a copy.
- **Links could not be clicked.** `openOnClick` was false, so clicking a link put
  a caret inside its text instead of opening it. A plain click opens the target
  in a new tab, with `rel="noopener noreferrer nofollow"`; editing a link goes
  through the toolbar's own fields.

- **Account creation.** Signing up failed with "Database error saving new user".
  The Supabase starter scaffold's `on_auth_user_created` trigger had survived the
  rename of `public.profiles` and still inserted into columns that had not
  existed since `20260829180000_member_profiles`, so every insert into
  `auth.users` raised inside it. `20260830020000_two_seat_archive.sql` drops the
  trigger and its function; the client's own `ensureProfile()` already wrote the
  profile row.

### Added

- **A two-seat rule enforced by the database.** `archives.seat_limit` defaults to
  `2` (accepting `1`-`8`), a `before insert` trigger on `archive_members` refuses
  the row past it, and `private.issue_archive_invite()` counts members plus
  unclaimed, unexpired invitations before issuing, so an unredeemable link is
  never created. Settings closes the form on the same arithmetic.
- **Withdrawing an invitation.** `revoke_archive_invite()` removes an unclaimed
  row after the same editor check that issuing makes, which destroys the stored
  digest, kills the link immediately, and returns the seat it was holding.
- **Sending an invitation by email.** A finished invitation offers the same
  one-time token two ways in the same place: copied, or handed to a `mailto:`
  the member's own mail app composes and sends. Nothing of ours receives it.
- **Members as a Settings section.** Roster, seats, pending invitations and the
  invite form move out of Security into their own section, opening on the seat
  count.
- **Placing the avatar.** A picture is dragged and zoomed behind a round window
  before upload, and the square that is uploaded is computed from the same three
  numbers the preview is drawn with, instead of being cut from the middle of the
  file. `src/lib/image.test.ts` covers the mapping.

### Changed

- **The login page separates its two modes.** Sign in and Create account are tabs
  at the top of the card, and the heading, sub-line, submit label and footnote
  belong to the tab showing. Both fields have a show/hide control. The
  confirmation state says what the emailed link does, that signing in comes after
  it, and where the archive comes from - without enumerating whether the address
  could be created.
- **Settings rows share one shape.** The profile picture became a row like the
  others, so every label starts at one x and every value ends at another; the
  notices in Members took the same card shape, and a section label after a card
  has room above it.

### Performance and visual

- `--shadow-soft` is a contact hairline plus a negatively spread pass instead of
  a 40 px blur spread evenly around every card, which over a wallpaper read as
  soot ringing the pane.
- The sidebar header no longer paints an opaque band across a translucent column,
  and the scope switch tints its track instead of plating it with a colour darker
  than the column holding it.
- Toolbars inside an already-translucent, already-blurred pane take neither the
  second coat nor the second `backdrop-filter`: one fewer full compositing pass
  per frame each, and no darker strip across the top of the column.
- The wallpaper layer declares `filter: none` at blur 0 rather than `blur(0)`,
  which was still promoting a viewport-sized fixed layer and running a pass.

### Removed

- The word-and-character metrics subsystem in the draft store - a second listener
  map, a per-note throttle timer, a counted-body cache and two counting helpers -
  which fed a readout the Tiptap editor no longer has. Typing a body now
  re-renders nothing at all. With it went `WorkspaceFooter`, `formatCount`,
  `countChars`, `isVirtualScope` and seven CSS rules for classes no component
  names.

### Editor (carried from the Tiptap migration)

- Replaced the source-text editor with a structured Tiptap document, including
  formatting, colours, checklists, editable tables, private media nodes and a
  reversible import path for existing notes.
- Added clipboard image insertion and concise table controls for deleting the
  selected row, column or table.
- Opening or focusing a note no longer emits an editor update or changes its
  modification time; only document-changing transactions enter the save queue.
- Organized the editor domain under `src/features/editor/`: four focused UI
  components and five small domain modules. `NoteList`, `Sidebar`,
  `WorkspaceMenus` and `notes.tsx` remain in their existing domains.
- Renamed the `preview` npm script to `preview:dist`; `preview:ui` remains the
  credential-free fixture on `localhost:5199`.
- Secured the Realtime Presence channel: `presence:<archiveId>` is now joined
  with `config.private = true` and the server allows `extension = 'presence'`
  only to members via `private.presence_archive_id()` in
  `supabase/migrations/20260829250000_private_archive_presence.sql` (`SELECT` to
  receive, `INSERT` to publish). Postgres Changes subscriptions remain public
  channels filtered by table RLS; `private_only` is not enabled globally.

## 2026-08-29 — Accounts, invitations, roles, avatars and private presence

### Added

- Public signup and email confirmation: the login route gains a sign-up mode with
  a neutral "check your email" confirmation state that does not enumerate
  addresses, and `ensure_personal_archive()` creates a personal archive
  atomically on first sign-in behind `private.bootstrap_personal_archive()`
  with an advisory lock.
- Multi-archive sign-in: `restoreSession` returns an archive chooser when the
  account holds more than one membership, instead of the old
  exactly-one-membership error.
- Archive invitations: `private.issue_archive_invite` returns a 64-hex raw token
  once and stores only its SHA-256 digest for seven days; `private.redeem_archive_invite`
  checks `auth.users.email_confirmed_at` and the lower-cased address before
  inserting `archive_members`. Re-inviting an unclaimed address rewrites the
  same row. The browser never resolves an email to a user id. Settings exposes a
  copyable link and the login flow can redeem an `?invite=` token.
- Explicit `editor` / `viewer` archive roles: `private.can_write_archive()` and
  the invitation / role RPCs enforce that only editors may write `archives`,
  `notes`, `folders`, `tags`, `note_tags` and `note-images`; viewers read
  everything but writes, invites and role changes are rejected, and the last
  editor cannot be demoted. Direct inserts/updates/deletes on
  `archive_members` are revoked; `create_archive_invite` requires a role choice.
- A roster of visible members and avatars: `public.profiles` (`nickname`,
  `avatar_object`) plus the private `avatars` bucket (`<userId>/<objectId>`),
  `private.shares_archive()` for reads, self-only writes, `src/lib/avatarCache.ts`
  with one object URL per avatar and Realtime updates, and a member list in
  Settings and avatar-framed segments in the scope switch.
- Mutual live presence: off by default, the client joins `presence:<archiveId>`
  only while broadcasting `{ userId, onlineAt }` and `realtime.messages` policies
  for `extension = 'presence'` (via `private.presence_archive_id()`) restrict it
  to members — `SELECT` to receive, `INSERT` to publish — on a private channel
  (`config.private = true`). The server derives the archive from
  `realtime.topic()`; Postgres Changes subscriptions are unchanged.
- Private vulnerability reporting and `SECURITY.md` with the Auth/RLS/Storage
  boundary as deployed.

### Changed

- `supabase/migrations/20260829220000_personal_archive_bootstrap.sql`,
  `…230000_archive_invitations.sql` and `…240000_archive_roles.sql` applied;
  the invitation RPC now carries a required `role`, and `archive_members` and
  `archive_invites` carry a `role` column with `editor`/`viewer` checks.
- Membership semantics clarified everywhere: every member can read; only editors
  write. Documentation (`README`, `PRODUCT`, `CLAUDE`, `DESIGN`) reflects the
  new signup, multi-archive, invitation, role, avatar and presence behavior, and
  the editor's new module location.

### Security

- `archive_members`, `archives`, `notes`, `folders`, `tags`, `note_tags` and
  `note-images` now enforce editor writes via `private.can_write_archive()`; the
  role assignment path is limited to `set_archive_member_role()` with a last-editor
  guard.
- `archive_invites` is member-select-only; writes go through security-definer
  functions that hash the token with `sha256`.
- `realtime.messages` now limits `presence` to archive members.
- Direct `archive_members` writes revoked for `authenticated`.

## 2026-08-29 — Public foundation

### Added

- Account profiles with nicknames and private avatar storage.
- Right-click menus for notes, folders, and the note page.
- Pull-request checks for lint, typecheck, tests, and production builds.
- A credential-free in-memory interface preview for contributors.
- GPL-3.0-or-later licensing and contributor documentation.

### Changed

- Replaced the two-person archive fixture with a roster of account members and
  one organizational scope per member.
- Rebuilt Settings around account, security, appearance, and reading sections.
- Renamed persistence states to Unsaved, Saving, Saved, Updated elsewhere, and
  Save failed, with stable toolbar geometry.
- Removed the retired encrypted client format and raw archive keys from browser
  storage after verifying that notes and files had already moved to ordinary
  account-protected storage.

### Fixed

- Kept toolbar controls from overlapping at narrow editor widths.
- Restored whole-pixel hairlines and overlay scrollbars.
- Corrected profile layout on phones and reduced-motion behavior in menus.
- Preserved production compatibility while retired database columns were
  removed after, rather than before, the compatible client deployment.

## 2026-08-28 — Supabase archive

### Added

- Supabase Auth, Postgres, Realtime, and private Storage as the application
  backend.
- Cross-account archive membership enforced by row-level security.
- Mobile navigation, Trash, PDF attachments, image paste, folders, tags,
  pinning, search, themes, wallpapers, and reading controls.

### Changed

- Replaced the legacy GitHub data branch with Supabase persistence while
  retaining the original branch as a migration backup.
