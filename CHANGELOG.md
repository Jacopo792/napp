# Changelog

This file records user-visible changes and security-relevant architecture
changes. The commit history remains the detailed engineering record.

## Unreleased

- Public account signup, archive invitations, roles, shared avatars, and
  presence are planned but not yet released.

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
