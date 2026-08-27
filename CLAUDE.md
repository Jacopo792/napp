# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this app is

A stateless, two-user encrypted note-taking app. Notes are stored as AES-256-GCM encrypted files on a GitHub `data` branch. There is no backend — the React SPA talks directly to the GitHub Contents API. Deployed to GitHub Pages.

**Origin**: vibe-coded by a non-programmer; fully refactored to be slim, correct, and slop-free.

---

## Running the app

```bash
pnpm install
pnpm dev           # dev server at http://localhost:5173
pnpm build         # production build → dist/
pnpm lint
```

### One-time key setup

```bash
cp .env.example .env
# Fill in MASTER_SEED (generate with command in .env.example), GITHUB_PAT, GITHUB_REPO
pnpm keygen
# Outputs: u1 bundle (keep private) and u2 bundle (send to user2 once, securely)
```

---

## Users and key model

```
MASTER_SEED (.env, local only — never committed)
    │
    ├── HKDF(seed, "u1") → u1_key   AES-256-GCM, encrypts notes tagged "u1"
    └── HKDF(seed, "u2") → u2_key   AES-256-GCM, encrypts notes tagged "u2"
```

- **u1 (master)**: derives both keys at login. Can read/write/delete all notes.
- **u2**: receives a pre-derived `u2_key` bundle. Can only read/write notes tagged `"u2"`.
- Both bundles embed the fine-grained GitHub PAT — writes go directly to GitHub from the browser.
- The PAT is not visible in the UI, but lives in `sessionStorage`. Security relies on u2 not extracting it from DevTools + the PAT being scoped to contents-write on this repo only.

**Login bundles** are opaque base64-encoded JSON:

```
u1: { type:"u1", seed:"<hex>", pat:"ghp_...", repo:"owner/repo" }
u2: { type:"u2", key:"<hex>", pat:"ghp_...", repo:"owner/repo" }
```

---

## .env and GitHub Actions

**.env is local only.** It is in `.gitignore` and must never be committed. The app does not need `MASTER_SEED`, `GITHUB_PAT`, or `GITHUB_REPO` at build time — those live in user login bundles, not in the built bundle.

The **deploy workflow** (`deploy.yml`) needs only `VITE_BASE_PATH`, which it computes automatically from the repo name. No GitHub Secrets are required for deployment.

If you ever want to run `npm run keygen` in CI (e.g., to rotate the PAT), you would add `MASTER_SEED`, `GITHUB_PAT`, and `GITHUB_REPO` as **GitHub Secrets** (repo → Settings → Secrets and variables → Actions) and reference them as `${{ secrets.MASTER_SEED }}` etc.

---

## File format

Every note: `notes/{uuid}.napp` on the `data` branch.

```
NAPP:1:<owner>
<base64(IV[12] || AES-GCM ciphertext)>
```

- Line 1 is the recipient tag (`u1` or `u2`) — checked before attempting decryption.
- Decrypted payload: `{ id, title, body, owner, createdAt, updatedAt }` (JSON).
- Files where the tag doesn't match an available key are silently skipped.

---

## Key files

| File                           | Role                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `src/lib/crypto.ts`            | HKDF key derivation, bundle parsing, AES-GCM encrypt/decrypt                     |
| `src/lib/github.ts`            | GitHub API — tree listing, blob read, write, delete, branch bootstrap            |
| `src/lib/sync.ts`              | Pulls other devices' writes: conditional tree poll, then only changed blobs      |
| `src/lib/session.ts`           | `sessionStorage` lifecycle — create, restore (re-derives keys on refresh), clear |
| `src/routes/index.tsx`         | Login page — paste bundle token                                                  |
| `src/routes/notes.tsx`         | Main UI — sidebar, editor, create / save-on-blur / delete                        |
| `scripts/keygen.mjs`           | Key generation (Node, uses `webcrypto` — same HKDF as browser)                   |
| `.github/workflows/deploy.yml` | Push to `main` → build → GitHub Pages deploy                                     |
| `.env.example`                 | Template for secrets needed by keygen                                            |

---

## GitHub repo layout

```
main   → source code; Actions deploys dist/ to GitHub Pages
data   → notes/{uuid}.napp  (auto-created on first login)
```

`ensureDataBranch()` in `github.ts` creates the `data` branch on first login if it doesn't exist.

---

## Cross-device sync

There is no backend to push from, so `notes.tsx` polls the branch while the tab
is visible: every 4s for 90s after any edit (local or remote), every 16s once
things go quiet, paused entirely when the tab is hidden and resumed the moment
it comes back.

Each poll is one conditional `GET /git/trees/data:notes` carrying the previous
ETag. GitHub answers 304 while the directory is byte-identical, and **304s do
not count against the rate limit**, so an idle archive costs nothing. When the
tree does move, only blobs whose SHA changed are read — editing one note pulls
one note.

Reads go through `/git/blobs/{sha}`, never `raw.githubusercontent.com`. Raw URLs
are branch-addressed and CDN-cached for five minutes, which is why a refresh
used to show stale text; a blob SHA is its content and cannot be stale. All
`api.github.com` requests use `cache: "no-store"` for the same reason.

**Local work always wins.** A remote body only reaches the editor when nothing
is queued for that note, and remote metadata is skipped while a metadata write
is pending. When it is safe to apply, only the span that actually differs is
replaced, so the caret does not move. Two people editing *the same note* at the
same time is still last-write-wins at note granularity — there is no merge.

---

## Deploy

1. In repo **Settings → Pages**, set Source to **GitHub Actions**.
2. Push to `main` — the workflow builds and deploys automatically.
3. The live URL is `https://<owner>.github.io/<repo>/`.

---

## `routeTree.gen.ts`

This file is auto-generated by the `@tanstack/router-plugin` Vite plugin on every `npm run dev` or `npm run build`. The committed version is a valid placeholder — it will be overwritten on first build. Do not edit it manually.
