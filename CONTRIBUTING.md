# Contributing

## Before anything else

Read `DESIGN.md`. Most of what looks like a free choice in this interface has
already been decided once, with the reasoning written down next to it. A change
that contradicts one of those rules is welcome — the rule is then part of the
change, and the file is updated in the same commit — but a change that
contradicts one by accident will be asked about.

## Getting it running

```bash
pnpm install
pnpm preview:ui
```

That is enough for anything that does not touch the database: the preview runs
the whole interface against an in-memory fixture, with no credentials and no
archive. Sign in with any email and password.

For work that touches persistence or collaboration, start local Supabase and a
Valkey-compatible Redis on port 6380, then run the server workspace described
in the README.

## The loop

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
pnpm build
```

The CI also runs the server against a fresh local Supabase, exercises two
instances through Redis, and builds the Docker image. Run `pnpm healthcheck`
before opening a pull request. Formatting
is Prettier through ESLint; `pnpm exec eslint . --fix` settles it.

## Branches

Work happens on `PP` and lands on `main` through a pull request. Please do not
open a branch per change unless there is a reason two lines of work must run at
once.

## Commits

The commit message is where the reasoning goes. State what changed, and state
why the old shape was wrong — a measurement, a failure, a rule. "Fix layout" is
not a commit message; "the readout sized itself and slid 55px on every debounce"
is. The history of this repository is meant to be readable a year later by
somebody deciding whether they may undo something.

## Interface work

Verify it, don't assume it. The preview is a real browser: measure the thing you
changed. Several of the faults fixed here — a toolbar overlapping by fifteen
pixels, ten real pixels lost to a scrollbar channel, thirty-one hairlines off
the device grid — looked fine in a screenshot and were only found by reading
geometry back out of the page.

## Migrations

Every migration must be safe to run twice. `create ... if not exists`,
`create or replace`, `drop policy if exists` before `create policy`,
`on conflict` on seed inserts, and a guarded `do` block for anything Postgres
gives no `if not exists` for — `add constraint` above all.

Two hazards specific to this project, both of which have already cost time:

- `supabase db query --linked` splits a file into statements and mis-pairs `$$`
  blocks when a file holds more than one. Give every function and `do` block its
  own tag: `$shares$`, `$touch$`, `$constraints$`.
- The database carries abandoned tables from earlier phases —
  `legacy_notes_20260828`, `legacy_profiles_20260829`, `note_shares` — so
  `create table if not exists` can silently do nothing against a name that is
  already taken by a different shape.

Anything that changes row-level security is reviewed as a security change, not a
schema change: `pnpm verify:supabase` must pass, and the reasoning for the new
policy belongs in the migration's own comment.

## Reporting something

Say what you did, what happened, and what you expected. If it is visual, a
screenshot with the window size in it is worth more than an adjective.

## Licence

The project is under the GNU General Public License, version 3 or later. By
opening a pull request you are offering your contribution under that licence.
There is no separate contributor agreement and nobody is asked to assign
copyright: you keep yours, and it stays GPL.
