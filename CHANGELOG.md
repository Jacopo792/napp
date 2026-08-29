# Changelog

This file records user-visible changes and security-relevant architecture
changes. The commit history remains the detailed engineering record.

## Unreleased

- Organized the editor domain under `src/features/editor/` (`components/` for
  `EditorToolbar`, `MarkdownEditor`, `NoteEditor`, `TitleField`; `lib/` for
  `attachments`, `draft`, `pdf`, `translation`) with `git mv` and updated
  imports. `NoteList`, `Sidebar`, `WorkspaceMenus` and `notes.tsx` remain where
  they are for now.
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
