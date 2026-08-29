# Repository guide

## Architecture

- React 19 + Vite is a static SPA deployed to GitHub Pages.
- Supabase is the only backend: Auth, Postgres, Realtime and private Storage.
- The browser receives only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Notes, folder names, tag names and files are stored as ordinary columns and
  Storage objects. Supabase Auth plus `archive_members` RLS is the whole access
  boundary; `owner` is only the `u1`/`u2` organisational label, and a member with
  no label is valid.

## Local development

```bash
cp .env.example .env.local
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

## Production deployment

GitHub repository variables required by `.github/workflows/deploy.yml`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No Supabase service-role key, account password, archive passphrase or legacy
GitHub credential belongs in GitHub Pages or its build.

After upgrading an existing archive to single-step login, run
`pnpm migrate:supabase` once with the legacy passphrases in the local migration
environment. It rewraps the existing DEK with each account password; note rows
and image objects are not re-encrypted.

An archive still holding ciphertext moves to account-only storage with
`pnpm migrate:account-only` (preflight) followed by
`pnpm migrate:account-only -- --apply`. Both print the same content checksum, so
a matching pair of runs is the proof that nothing changed but the encoding.
`pnpm verify:supabase` then checks the live archive: plaintext columns,
cross-account reads and writes, Realtime, and that anonymous and member-less
clients still see nothing.

Someone who should use the app without reading an existing archive needs their
own archive, not a membership: `supabase/admin/new-archive-for-person.sql` creates
one in the Supabase SQL editor. Membership is full read and write over every note
in the archive, so it is only for people who are meant to share the notes.

Connect another Supabase Auth account to an existing archive with
`pnpm add:member`. It signs in as an existing member and writes the missing
`public.archive_members` row, which is what the "This account is not connected to
the archive" message means. New members join with `owner = null`: the
`archive_members_archive_owner_idx` unique index keeps one `u1` and one `u2` per
archive, and an unlabelled member opens on the u1 view while keeping the
Jacopo / Lisa switch.

A member is a person: `public.profiles` carries a nickname and an avatar object
per account, and avatars live in their own private bucket under the owner's user
id. The rule does not change — `private.shares_archive()` lets you read the
profile of someone you share an archive with, and only the account itself may
write its own row.

Two things to know before writing another migration. `supabase db query --linked`
splits a file into statements and mis-pairs `$$` blocks when a file holds more
than one, so give every function and `do` block its own tag (`$shares$`,
`$touch$`); apply a long migration in pieces if it still fails. And this project
carries abandoned tables from earlier phases — `legacy_notes_20260828`,
`legacy_profiles_20260829`, `note_shares` — so `create table if not exists` can
silently do nothing against a name that is already taken by a different shape.

## One-time migration tools

The files in `scripts/` are local administrative tools, not part of the
production deployment. Their private variables are documented separately in
`.env.migration.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a
`VITE_` variable.
