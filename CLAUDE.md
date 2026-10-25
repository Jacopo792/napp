# Repository guide

Keep this file a short operating guide. Record a decision once, with its reason
and owning source. Replace superseded instructions; do not append competing
versions, incident diaries, fixed test counts or unverified deployment claims.
The implementation and configuration establish current behavior.

## Working safely in this repository

- `main` is the public web/desktop release branch; `PP` is public pre-production.
  `ios` and `android` already exist and are retained at Jacopo's request.
- Do not create branches unless Jacopo explicitly names one. Do not open pull
  requests. Work in an existing checkout and inspect its status first.
- Other sessions may be working concurrently. Preserve their changes and commits;
  never reset, force-push or overwrite their work. Do not delete branches unasked.
- Keep `PP` aligned only when doing so preserves its work. If it has commits absent
  from `main`, inspect and reconcile them deliberately; never blindly push
  `main:PP` or force either branch.
- **The mobile client is commercial. Do not push its source, build artifacts,
  private development documents or commit history to the public repository.**
  Existing remote mobile branches are not authorization for further mobile pushes.
  Prepare public work from `main`; copy only reviewed public changes, never merge
  a mobile branch into `main` or `PP`. Inspect the outgoing tree and history.
- Public marketing screenshots are allowed. Use only images captured on an
  iPhone and supplied/approved for publication. Keep credentials and email addresses out of them.
  Announce the mobile app as coming soon until distribution is actually verified.

## Architecture and ownership

| Location                 | Responsibility                                          |
| ------------------------ | ------------------------------------------------------- |
| `packages/core`          | Shared domain logic and the web/desktop React interface |
| `apps/web`               | Browser entry, platform adapter and Vite configuration  |
| `apps/desktop`           | Electron entry, native integration and packaging        |
| `packages/collab-server` | Hocuspocus collaboration, authorization and persistence |
| `supabase`               | Database migrations, RLS and account-deletion function  |
| `preview`                | In-memory web/desktop development fixtures              |

The separate native mobile client reuses domain logic and the hosted editor;
its native screens are not a copy of the web interface. Mobile implementation
instructions belong only in the mobile checkout, outside public releases.

Core must not import Electron or anything under `apps/`; ESLint enforces this.
Put real host differences in `platform.ts`, initialized before mounting. Use
optional capabilities where a host cannot implement a feature. Keep domain
rules shared; do not grow parallel persistence, authorization or editor logic.
Menus share data from `menuShape.ts` rather than separate JSX/native templates.

Supabase provides Auth, Postgres RLS, Realtime and private Storage. Yjs/Hocuspocus
owns live note title/content; `note_documents` holds durable binaries and
Redis/Valkey carries updates between overlapping server instances. Content and
local caches are plaintext, access-controlled, not end-to-end encrypted. The
logo is artwork, not an encryption claim.

## Invariants that must survive changes

- Bind the editor to the authorized Y.Doc, synced from the server or recovered
  from a valid Yjs cache after archive access is checked. Do not seed a temporary
  editor from projection JSON or persist collaborative typing with `saveNote()`.
  Exports read the live document. Capture binary and projection together before
  the first asynchronous persistence step.
- Enforce access and note/passage locks on the server and with RLS. Client checks
  are usability, not authorization. Opening a note, presence and default metadata
  must not count as an edit or change its modification time.
- Register persisted marks/nodes in the shared schema (`BASE_EXTENSIONS`). Comment
  anchors are document marks, not stored text offsets. Suggestion plugins need
  distinct keys. Local transaction filters must allow Yjs synchronization.
- Restoring history must first preserve the present; stop on failure, concurrent
  edits, permission changes or unmount. See `historyRestore.ts` and its tests.
- Explicit sign-out asks before removing local content, including unsynced edits.
  Removal is account-scoped and coordinated across tabs; block new opens and late
  writes until it finishes. Automatic lock and account switching retain recovery
  data. See `docs/quality-hardening.md`.
- Account preferences live in `profile_preferences`; device layout stays local.
  Merge read watermarks and What's New with their monotonic merge helpers, never
  blindly overwrite them. Presence is opt-in, not a stored last-access tracker.
- Sign-in imports the lightweight `session`/`supabaseClient`/`noteStore` path,
  never the editor schema through `supabase.ts`. Keep the notes route and Settings
  lazy. A change to a fixture's real API must update its preview stand-in too.

See `docs/engineering-invariants.md` for media, export and rendering constraints.

## Interface decisions

- Keep the desktop's flush panes and shared toolbar band. Floating inset panes,
  dock magnification and decorative icon hover wiggles were deliberately rejected.
- Use centralized icons (`components/icons.ts` for web/desktop); touch controls
  need adequate targets, at least 44 pt on the phone.
- Web/desktop row swipes reveal actions; pressing the revealed button performs
  them. Native gesture behavior is defined in the mobile checkout, not inferred
  from the browser implementation.
- Animate from the action's origin toward its destination; use a fade when there
  is no meaningful direction, and respect reduced motion. Read current motion
  tokens rather than inventing new curves.
- Do not add explanatory paragraphs beneath controls. Name controls clearly;
  status, errors and a concise settings-row value are allowed.
- Browser translation must not mutate React's text nodes (`translate="no"`).
- Tags and the member-role picker were deliberately removed from the interface.
  Legacy database support does not authorize bringing either interface back.

## Development and verification

Use the Node/pnpm versions declared in `.nvmrc` and `package.json`. Commands in
`package.json` are authoritative; do not copy stale flags from old work logs.

```bash
pnpm install --frozen-lockfile
pnpm dev                    # web
pnpm dev:desktop            # Electron
pnpm preview:ui             # in-memory web fixture, no credentials
pnpm preview:desktop-ui     # same fixture in the desktop renderer
pnpm healthcheck            # format, lint, types, tests, web build, diff check
pnpm test:e2e               # preview smoke tests
```

Real backend tests use disposable local Supabase accounts, never production
credentials. Start local Supabase and Valkey as described in
`docs/quality-hardening.md`, then run server and full-stack browser checks for
changes to access, persistence, sessions, deletion or deployment. Report actual
results, including skips and failures. Do not turn failures into silent retries.

Run `pnpm healthcheck` before a public push. Documentation-only work does not
need new implementation tests, version bumps or a desktop tag. For UI work,
inspect the rendered result as well as the source.

## Deployment and releases

- `main` pushes run `.github/workflows/ci.yml`. Checks gate the deploy job; the
  configured Render hook requests the backend deployment. The workflow verifies
  the requested revision, readiness and allowed origins before publishing Pages.
  A missing hook is reported as a skipped backend deployment, not proof of rollout.
- `render.yaml` documents service settings; it does not update the existing live
  service by itself. `ops/collab-origins.json` records expected origins. Verify
  the running SHA and WebSocket behavior; a healthy old instance is not a deploy.
- `/healthz` is liveness, `/readyz` checks dependencies and `/version` identifies
  the running revision. Keep-alive timing belongs to its workflow; GitHub cron
  is best-effort and is not an uptime guarantee.
- Before an application release, align web/desktop versions, the English
  user-facing What's New entry and `CHANGELOG.md`. Push the reviewed public
  commit, verify CI, then tag `v<version>` to build the desktop installers.
  Confirm both macOS DMGs and the Windows EXE are attached and publicly available.
  Do not call a build signed, notarized or store-approved without evidence.
- Apply compatible schema additions before deploying clients that select them.
  Remove old columns only after replacement clients have deployed and older
  clients have been considered. Check `supabase migration list --linked` rather
  than asserting that every migration is applied.
- `supabase config push` affects the whole config. Review its diff against live
  settings, including email limits and authentication flags, before applying it.

## Credentials and branding

Public client configuration uses the documented `VITE_*` variables.
`VITE_WEB_ORIGIN` is the published invitation/recovery destination, not an
Electron or localhost origin in released builds. Service-role credentials stay
in trusted server/admin environments, never in a client bundle, `VITE_*`, logs,
screenshots or committed files. Administrative tools use `.env.migration.example`.

`docs/branding/napp-logo.svg` is the supplied logo's scalable source: white arch
and five rules on black. Reuse its geometry; do not substitute the retired
botanical N, paper stack or other invented marks. Web icons, sign-in art and
desktop resources must agree. Native asset regeneration belongs to the mobile
checkout. Do not regenerate working assets just to change documentation.

Keep product scope and screenshots in `README.md`, installation in `DESKTOP.md`,
security/reporting in `SECURITY.md`, operations in `docs/`, and release history in
`CHANGELOG.md`. Those documents should be linked, not duplicated here.
