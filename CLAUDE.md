# Repository guide

## Architecture

- React 19 + Vite is a static SPA deployed to GitHub Pages.
- Supabase is the only backend: Auth, Postgres, Realtime and private Storage.
- The browser receives only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Notes, folder names, tag names and images are encrypted in the browser. RLS
  authorizes by shared archive membership; `owner` is only the `u1`/`u2`
  organisational label.

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

## One-time migration tools

The files in `scripts/` are local administrative tools, not part of the
production deployment. Their private variables are documented separately in
`.env.migration.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` through a
`VITE_` variable.
