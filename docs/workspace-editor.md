# Workspace and editor ownership

Start from the responsibility being changed. `Notes.tsx` composes the workspace;
`RichTextEditor.tsx` binds one editor to its document and exposes the editor handle.
Neither is the home for every feature displayed inside it.

## Workspace

The modules below live in `packages/core/src/screens/`.

| Module                     | Owns                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `Notes.tsx`                | Archive state, navigation, selection, metadata actions and workspace composition.       |
| `useArchiveWrites.ts`      | Draft/metadata draining, conflict recovery, retry scheduling and page-hide flushing.    |
| `useNoteExchange.ts`       | Markdown import, clipboard copy and file/folder export.                                 |
| `useMediaIndexing.ts`      | Attachment text loading, Realtime subscription, recognition and cancellation.           |
| `useDocumentReferences.ts` | Manuscript contents, numbered targets and bibliography importer lifetime.               |
| `workspacePalette.tsx`     | Commands and local/remote search results built from the current snapshot and callbacks. |
| `useNotesLayout.ts`        | Pane layout and focus/navigation visibility.                                            |
| `useArchiveRemarks.ts`     | Archive conversations and unread counts.                                                |
| `useArchiveInvites.ts`     | Invitation loading, creation and revocation.                                            |
| `usePresence.ts`           | Archive presence.                                                                       |

The write hook receives the screen's stable refs because remote refresh, note
creation and archive departure share the same in-flight gate and metadata queue.
Do not create a second queue in a feature hook. `schedule` queues a save,
`saveNow` requests a flush and `settleWrites` waits for the current write before
flushing the remainder. `drain` is also available to guarded creation/departure
operations that already coordinate with the in-flight gate. Collaborative typing
still belongs to Yjs, not row saves.

Palette construction does not navigate or own archive state. Navigation happens
only when a command's callback runs. Remote results tell the screen both the
archive and note to open, so the screen retains ownership of remount handoff.

Export reads the authorized live Y.Doc when available, then the draft, then the
stored projection. Keep content capture before asynchronous host I/O.

## Editor

These modules live beside `RichTextEditor.tsx` in
`packages/core/src/features/editor/components/`.

| Module                           | Owns                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `RichTextEditor.tsx`             | Editor lifetime, document binding, host callbacks, formatting and handle.      |
| `RichTextEditor.types.ts`        | The handle, props, format actions and search status contract.                  |
| `nodeViewExtensions.ts`          | Browser node-view registration for the shared persisted schema.                |
| `passageExtensions.ts`           | Local write-lock courtesy, comment decorations and passage reveal.             |
| `textEditingExtensions.ts`       | Manuscript shortcuts, capitalization and spelling correction.                  |
| `editorSuggestions.tsx`          | Slash commands and note-link suggestions, with separate plugin keys.           |
| `mediaNodeViews.tsx`             | Private image/video/file loading and node interaction.                         |
| `ImageLightbox.tsx`              | Image viewer lifetime and presentation.                                        |
| `DrawingView.tsx`                | Board/page node rendering and writing completed marks to the document.         |
| `DrawingStage.tsx`               | Draft drawing, crop/rotate, undo/redo, commit/cancel and phone lending.        |
| `useDrawingStage.ts`             | Phone availability and a block's stage/handoff lifetime.                       |
| `useInk.tsx`                     | Pointer gestures, pending strokes, erasing, captions and mark manipulation.    |
| `PenTray.tsx`, `drawingTools.ts` | Tool presentation and available tools/nibs.                                    |
| `drawingGeometry.ts`             | The browser's image-plane layout and crop limits.                              |
| `drawingRequests.ts`             | Drawing events and one-shot insertion intent, outside persisted document data. |

Persisted nodes and marks remain in `features/editor/lib/content.ts`. Browser
node views may extend their presentation, but must not redefine the schema or
introduce React into the collaboration server. Editor helpers import the type
contract directly rather than importing the editor component back into themselves.
The original component module re-exports its existing public types and events
for callers that already use that path.

Inline ink is written once per completed gesture. The desktop stage keeps a
local draft until Done; Cancel and Escape discard it. Phone lending follows the
existing live-document handoff. Insertion intent is consumed once so returning
to a note does not unexpectedly open its board or pick up its page pen.

## Verification

Run `pnpm healthcheck` for formatting, lint, all declared types, unit/SQL checks
and the web build. `pnpm test:e2e` exercises preview navigation, editing, slash
formatting, note links, Spotlight heading search and drawing commit/cancel.
For persistence, authorization, cache/session cleanup and collaboration changes,
run `pnpm test:e2e:full` against the disposable local stack documented in
[quality-hardening.md](quality-hardening.md).
