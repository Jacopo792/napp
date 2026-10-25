# Engineering invariants

This is a map of fragile boundaries and their owning sources, not a feature list.
Keep it current when changing one of those boundaries.

## Collaboration, access and history

`lib/collab.ts` owns live document providers and parked documents. The editor
binds to those documents, including their live title, after archive access is
checked: either remotely synced or recovered from a valid Yjs cache. Do not make
remote sync a new prerequisite for the existing cached/offline path.
Server persistence in `packages/collab-server/src/documents.ts` captures the Yjs
binary and its projection before awaiting database work; mixing snapshots can
otherwise make a newer binary disagree with an older saved projection.

`writeLocks.ts` enforces passage locks where updates pass through the server.
A local filter is not sufficient. Do not reject normal Yjs sync transactions in
the editor, and preserve the lock mark's single-holder schema semantics.
`CommentAnchor` instead allows overlapping instances: do not copy its mark
exclusion rules into write locks. Persisted schema changes must be understood by
all readers/serializers through `BASE_EXTENSIONS`.

`lib/historyRestore.ts` preserves the current version before replacing anything.
Check its cancellation and concurrent-edit guards when changing restore flows.
Note/person activity and version history derive from the same version records;
opening a document or publishing awareness is not an authored edit.

`lib/preferenceShape.ts` owns preference normalization and merges. Read stamps
are per note and account; opening a list does not mark all conversations read.
Presence means current opt-in activity, not authorship or a stored access history.

## Media and imports

`features/editor/lib/paste.ts` preserves rich clipboard structure and promotes
images to private references before insertion. Prefer supplied clipboard bytes;
use the platform clipboard only as the ordinary paste event's fallback.

`packages/collab-server/src/importImage.ts` is an authorized image importer,
not an open proxy. Preserve HTTPS-only URL validation, public-IP checks, DNS
pinning, per-hop redirect validation, payload/time bounds and fresh note-write
authorization. Never replace it with an arbitrary server-side fetch.

`lib/attachments.ts` classifies attachments by supported filename extension;
platform MIME sniffing is not consistent. Media remains in private Storage.
Drawing/annotation content is part of the document and must survive live merges,
undo, serialization and supported exports. Keep OCR an explicit operation and
ship its worker/language assets locally for both public shells.

## Export, printing and menus

Markdown serialization and parsing share the editor schema. Preserve existing
round-trip tests and note-link behavior; private media references alone do not
export the underlying bytes to another application.

Print and Save as PDF are distinct. Desktop PDF uses the print layout through
`platform().savePdf`; browser export has its own renderer. Print must disable
entrance animations, hide non-document panes and remove clipping/flex constraints
that would truncate the document. Responsive layout must query `screen`, so
printing does not switch to the narrow-screen note list.

Exports must read live content, carry supported images/annotations, paginate
between lines/blocks and write through the platform export capabilities
(`saveFile`, or desktop `savePdf`). Keep a visible
exporting state while work runs; do not report a file before it is produced.

`lib/menuShape.ts` is the shared menu description. IPC payloads carry serializable
values, not functions/React nodes; the Electron main process validates their
shape, depth and length. Native menus are optional capabilities, not a second
application model. Browser file pickers still require a real user gesture.

## Rendering regressions to avoid

- Web/desktop panes are flush, with one aligned toolbar band. Their hairline
  seams are also resize handles with a larger invisible hit area.
- Keep the Windows text-compositing constraints: entrance animation fill is
  `backwards`, not persistent `both`; avoid needless full-screen layers, nested
  backdrop filters and `blur(0)` instead of `none`.
- Shared-grid tracks use `minmax(0, 1fr)` when content may overflow. Keep capped
  content centered rather than leaving an empty strip on one side.
- Comment-margin cards live inside the document's scroller. Position updates
  must not rerender the editor on every scroll; narrow panes retain the panel.
- `platform().openFile` accepts a loader so the browser can synchronously claim
  a tab during the click before awaiting bytes. Do not move that await ahead
  of the shell's decision.
- Pure source modules tested by Node's type-stripping runner use explicit `.ts`
  extensions for relative runtime imports. Keep schema-heavy imports out of the
  authentication path.

## Database operations

Await PostgREST query builders and inspect their returned errors; constructing a
builder alone does not perform the write. A service-role operation still needs
application authorization because it bypasses RLS.

Use fresh local migrations to verify changes. Existing abandoned tables can make
`create table if not exists` hide a schema mismatch; inspect triggers/functions
in the linked database when an error names something absent from source.
Compatibility additions precede client deployment; destructive cleanup follows
verified rollout. Legacy migration/admin tools are not current app behavior.
