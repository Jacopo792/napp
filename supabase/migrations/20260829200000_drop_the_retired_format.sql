-- The encrypted format, the u1/u2 labels, and three abandoned tables.
--
-- Not applied automatically anywhere: this drops columns and tables, and the
-- point of a rolling migration is that the rollback window closes deliberately
-- rather than by accident. Everything below was verified empty or unread before
-- it was written, and the client has already stopped mentioning any of it.
--
-- What was checked, on 2026-08-29:
--   · ciphertext / settings_ciphertext: 0 non-null rows across notes, folders,
--     tags and archives.
--   · storage: every object in note-images carries a real content type
--     (image/png, image/webp, application/pdf), so none of them is a ciphertext
--     blob waiting to be opened.
--   · owner: `src/` no longer reads it; `scripts/add-archive-member.mjs` and
--     `scripts/verify-supabase.mjs` were rewritten off it first.
--   · legacy_notes_20260828: five rows, all titled "Jacopo" with four
--     characters of content, written twelve seconds apart during the first
--     scaffold. Test data, not notes.
--   · legacy_profiles_20260829: the abandoned starter profiles table, replaced
--     by public.profiles.
--   · note_shares: empty, and carrying a recursive policy that errors when
--     read.
--
-- Run it with `supabase db push`, and `pnpm verify:supabase` afterwards.

-- ── The encrypted format ────────────────────────────────────────────────────
alter table public.notes drop column if exists ciphertext;
alter table public.folders drop column if exists ciphertext;
alter table public.tags drop column if exists ciphertext;
alter table public.archives drop column if exists settings_ciphertext;

drop table if exists public.vault_keys;

-- ── The u1 / u2 labels ──────────────────────────────────────────────────────
-- `owner_id` replaced these, with its own set of composite keys added in
-- 20260829190000. The unique index existed to keep one u1 and one u2 per
-- archive, which is exactly the two-person assumption being removed.
--
-- Order matters, and `drop column` alone is not enough: `owner` participates in
-- three-column unique keys that foreign keys in other tables point at, so
-- dropping the column would be refused for the dependency rather than dropping
-- it quietly. Foreign keys first, then the keys they referenced, then the
-- checks, then the columns.
alter table public.note_tags drop constraint if exists note_tags_note_id_archive_id_owner_fkey;
alter table public.note_tags drop constraint if exists note_tags_tag_id_archive_id_owner_fkey;
alter table public.notes drop constraint if exists notes_folder_id_archive_id_owner_fkey;

alter table public.notes drop constraint if exists notes_id_archive_id_owner_key;
alter table public.folders drop constraint if exists folders_id_archive_id_owner_key;
alter table public.tags drop constraint if exists tags_id_archive_id_owner_key;

alter table public.archive_members drop constraint if exists archive_members_owner_check;
alter table public.notes drop constraint if exists notes_owner_check;
alter table public.folders drop constraint if exists folders_owner_check;
alter table public.tags drop constraint if exists tags_owner_check;
alter table public.note_tags drop constraint if exists note_tags_owner_check;

drop index if exists public.archive_members_archive_owner_idx;

drop function if exists private.member_for_label(uuid, text);

alter table public.archive_members drop column if exists owner;
alter table public.notes drop column if exists owner;
alter table public.folders drop column if exists owner;
alter table public.tags drop column if exists owner;
alter table public.note_tags drop column if exists owner;

-- ── Abandoned tables ────────────────────────────────────────────────────────
-- These two depend on each other and neither can go first. `legacy_notes` has
-- two policies whose expressions read `note_shares`; `note_shares` has a
-- foreign key and a policy that read `legacy_notes`. Dropped in one statement,
-- Postgres resolves the pair — and because this is not `cascade`, anything
-- outside the pair that still depended on either would still refuse, which is
-- the check worth keeping.
drop table if exists public.legacy_notes_20260828, public.note_shares;
drop table if exists public.legacy_profiles_20260829;
