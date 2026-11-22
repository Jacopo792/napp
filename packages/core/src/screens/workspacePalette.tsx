import { type Command } from "@/components/CommandPalette";
import {
  Archive,
  Chapters,
  Columns2,
  FileText,
  Folder,
  FolderDown,
  Footnote,
  Heading2,
  History,
  Keyboard,
  Layers,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  NotebookText,
  Pilcrow,
  Search,
  Settings,
  Sparkle,
  SquarePen,
  Trash2,
  UserRound,
} from "@/components/icons";
import type { SettingsSection } from "@/components/settingsSections";
import { settingsSectionsFor } from "@/components/settingsSectionsFor";
import { type Scope } from "@/components/Sidebar";
import type { ArchiveComment } from "@/lib/comments";
import { derivedOf } from "@/lib/derived";
import { referenceSnapshot, type Place } from "@/lib/documentContents";
import { type NoteEntry } from "@/lib/entries";
import { fold, formatDateTime } from "@/lib/format";
import { type NamedVersion } from "@/lib/history";
import { manuscriptOf } from "@/lib/manuscript";
import { readableMedia } from "@/lib/mediaTextShape";
import { REFERENCE_WORDS } from "@/lib/references";
import { ALL, ARCHIVE, REMARKS, TRASH } from "@/lib/scopes";
import { findInOtherArchives, type Space } from "@/lib/spaces";
import { headingsOf, nameMatch, snippetOf } from "@/lib/spotlight";
import { type ArchiveMember } from "@/lib/supabase";
import type { JSONContent } from "@tiptap/core";

interface PaletteData {
  paletteOpen: boolean;
  docMode: boolean;
  manuscript: ReturnType<typeof manuscriptOf> | null;
  entries: NoteEntry[];
  ownedEntries: NoteEntry[];
  scopes: Scope[];
  archiveComments: ArchiveComment[];
  roster: ArchiveMember[];
  namedVersions: NamedVersion[];
  spaces: Space[];
  archiveId: string | undefined;
  templates: NoteEntry[];
  canWriteArchive: boolean;
  selectedId: string | null;
  splitId: string | null;
  trashedIds: Set<string>;
  splitEntry: NoteEntry | null;
  focusMode: boolean;
  indexingMedia: boolean;
  mediaTexts: Map<string, string>;
}
interface PaletteActions {
  openFound: (id: string, then?: { reveal?: Place; history?: string }) => () => void;
  setSelectedId: (id: string | null) => void;
  handleSelectFolder: (id: string) => void;
  handleSelectNote: (id: string) => void;
  setQuery: (query: string) => void;
  setSelectedFolderId: (id: string) => void;
  setOpenThen: (target: { noteId: string; comments: boolean }) => void;
  nameOf: (member: ArchiveMember) => string;
  openSheet: (sheet: { kind: "person"; userId: string }) => void;
  switchArchive: (id: string) => void;
  handleNewChapter: (folderId: string | null) => void;
  handleNew: () => void;
  handleNewFrom: (seed: { title: string; content: JSONContent }) => void;
  setSplitId: (id: string | null) => void;
  toggleFocus: () => void;
  setSettingsOpen: (open: boolean) => void;
  indexMedia: () => void;
  handleExportAll: () => void;
  openWhatsNew: () => void;
  setShortcutsOpen: (open: boolean) => void;
  handleLock: () => void;
  setSettingsSection: (section: SettingsSection) => void;
  openInArchive: (archiveId: string, noteId: string) => void;
}

/** Commands and search results for the current workspace snapshot. Navigation stays with the screen. */
export function workspacePalette(data: PaletteData, actions: PaletteActions) {
  const {
    paletteOpen,
    docMode,
    manuscript,
    entries,
    ownedEntries,
    scopes,
    archiveComments,
    roster,
    namedVersions,
    spaces,
    archiveId,
    templates,
    canWriteArchive,
    selectedId,
    splitId,
    trashedIds,
    splitEntry,
    focusMode,
    indexingMedia,
    mediaTexts,
  } = data;
  const {
    openFound,
    setSelectedId,
    handleSelectFolder,
    handleSelectNote,
    setQuery,
    setSelectedFolderId,
    setOpenThen,
    nameOf,
    openSheet,
    switchArchive,
    handleNewChapter,
    handleNew,
    handleNewFrom,
    setSplitId,
    toggleFocus,
    setSettingsOpen,
    indexMedia,
    handleExportAll,
    openWhatsNew,
    setShortcutsOpen,
    handleLock,
    setSettingsSection,
    openInArchive,
  } = actions;
  /* What a document finds is its own: chapters and the notebook, in whoever's
     scope the structure keeps them; a notes archive finds the scope on screen,
     as it always has. */
  const searchable = !paletteOpen
    ? []
    : docMode && manuscript
      ? (() => {
          const ids = new Set(
            [...manuscript.chapters, ...manuscript.notebook].map((item) => item.id),
          );
          return entries.filter((entry) => ids.has(entry.note.id));
        })()
      : ownedEntries;

  const paletteCommands: Command[] = ((): Command[] => {
    if (!paletteOpen) return [];
    const open = (id: string) => openFound(id);
    const stamp = (entry: NoteEntry) => Date.parse(entry.note.updatedAt);
    const chapters = manuscript?.chapters ?? [];
    return [
      ...(docMode && manuscript
        ? [
            {
              id: "go:title",
              group: "Go to",
              name: "Title page",
              keywords: "cover front document",
              icon: <Chapters size={16} />,
              run: () => setSelectedId(null),
            },
          ]
        : scopes.map((scope) => ({
            id: `scope:${scope.id}`,
            group: "Go to",
            name: scope.label,
            icon:
              scope.id === TRASH ? (
                <Trash2 size={16} />
              ) : scope.id === REMARKS ? (
                <MessageSquare size={16} />
              ) : scope.id === ARCHIVE ? (
                <Archive size={16} />
              ) : scope.id === ALL ? (
                <NotebookText size={16} />
              ) : (
                <Folder size={16} />
              ),
            run: () => handleSelectFolder(scope.id),
          }))),
      /* The running text is found by the Text group below, with the line it
         is in; here a note is found by its name. */
      ...(docMode && manuscript
        ? [
            ...chapters.map((item, index) => ({
              id: `note:${item.id}`,
              group: "Chapters",
              name: item.title || "Untitled",
              hint: [
                `Chapter ${index + 1}`,
                item.folderId ? manuscript.parts.get(item.folderId) : undefined,
              ]
                .filter(Boolean)
                .join(" · "),
              icon: <FileText size={16} />,
              run: open(item.id),
            })),
            ...manuscript.notebook.map((item) => ({
              id: `note:${item.id}`,
              group: "Notes",
              name: item.title || "Untitled",
              icon: <NotebookText size={16} />,
              run: open(item.id),
            })),
            ...[...manuscript.parts].flatMap(([partId, name]) => {
              const first = chapters.find((item) => item.folderId === partId);
              return first
                ? [
                    {
                      id: `part:${partId}`,
                      group: "Parts",
                      searchOnly: true,
                      name,
                      hint: first.title || "Untitled",
                      icon: <Folder size={16} />,
                      run: open(first.id),
                    },
                  ]
                : [];
            }),
          ]
        : ownedEntries.map((entry) => ({
            id: `note:${entry.note.id}`,
            group: "Notes",
            name: entry.note.title || "Untitled",
            hint: derivedOf(entry.note).preview || undefined,
            at: stamp(entry),
            icon: <FileText size={16} />,
            run: open(entry.note.id),
          }))),
      /* What was said, searchable with everything else. A remark is the one
         thing in this archive that was not reachable from here — and it is
         the kind of thing you go looking for by its words rather than by the
         note it is on. Opening one is opening its note in the scope that
         opens conversations with it, which is the path that already exists. */
      ...archiveComments.flatMap((remark) => {
        const entry = searchable.find((candidate) => candidate.note.id === remark.noteId);
        if (!entry) return [];
        const title = entry.note.title || "Untitled";
        return [
          {
            id: `remark:${remark.id}`,
            group: "Remarks",
            name: remark.body,
            hint: title,
            keywords: `${remark.body} ${title}`.toLowerCase(),
            icon: <MessageSquare size={16} />,
            run: docMode
              ? () => {
                  openFound(remark.noteId)();
                  setOpenThen({ noteId: remark.noteId, comments: true });
                }
              : () => {
                  setQuery("");
                  setSelectedFolderId(REMARKS);
                  handleSelectNote(remark.noteId);
                },
          },
        ];
      }),
      ...roster.map((member) => ({
        id: `person:${member.userId}`,
        group: "People",
        searchOnly: true,
        name: nameOf(member),
        icon: <UserRound size={16} />,
        run: () => openSheet({ kind: "person", userId: member.userId }),
      })),
      ...namedVersions.flatMap((version) => {
        const entry = entries.find((candidate) => candidate.note.id === version.noteId);
        if (!entry || !version.label) return [];
        return [
          {
            id: `version:${version.id}`,
            group: "Versions",
            searchOnly: true,
            name: version.label,
            hint: `${entry.note.title || "Untitled"} · ${formatDateTime(version.createdAt)}`,
            at: Date.parse(version.createdAt),
            icon: <History size={16} />,
            run: openFound(version.noteId, { history: version.id }),
          },
        ];
      }),
      ...spaces
        .filter((space) => space.archiveId !== archiveId)
        .map((space) => ({
          id: `archive:${space.archiveId}`,
          group: "Groups",
          searchOnly: true,
          name: space.name,
          keywords: "group archive space switch",
          icon: <Layers size={16} />,
          run: () => switchArchive(space.archiveId),
        })),
      {
        id: "new",
        group: "Do",
        name: docMode ? "New chapter" : "New note",
        hint: "⌘N",
        icon: <SquarePen size={16} />,
        run: () => (docMode ? handleNewChapter(null) : void handleNew()),
      },
      ...(docMode || !canWriteArchive
        ? []
        : [
            ...templates.map((template) => ({
              id: `template:${template.note.id}`,
              group: "New from template",
              name: template.note.title || "Untitled",
              keywords: "template modello new",
              icon: <SquarePen size={16} />,
              run: () =>
                void handleNewFrom({ title: template.note.title, content: template.note.content }),
            })),
          ]),
      ...(selectedId && !docMode
        ? ownedEntries
            .filter(
              (entry) =>
                entry.note.id !== selectedId &&
                entry.note.id !== splitId &&
                !trashedIds.has(entry.note.id),
            )
            .map((entry) => ({
              id: `split:${entry.note.id}`,
              group: "Open beside",
              name: entry.note.title || "Untitled",
              keywords: `split side by side beside ${derivedOf(entry.note).haystack}`,
              icon: <Columns2 size={16} />,
              run: () => setSplitId(entry.note.id),
            }))
        : []),
      ...(splitEntry
        ? [
            {
              id: "unsplit",
              group: "Do",
              name: "Close the second note",
              icon: <Columns2 size={16} />,
              run: () => setSplitId(null),
            },
          ]
        : []),
      {
        id: "focus",
        group: "Do",
        name: focusMode ? "Leave focus" : "Focus mode",
        hint: focusMode ? "Esc" : "One column, nothing else",
        keywords: "zen distraction free writing",
        icon: focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />,
        run: toggleFocus,
      },
      {
        id: "settings",
        group: "Do",
        name: "Settings",
        icon: <Settings size={16} />,
        run: () => setSettingsOpen(true),
      },
      ...(canWriteArchive
        ? [
            {
              id: "ocr",
              group: "Do",
              name: indexingMedia ? "Reading images and PDFs…" : "Make images and PDFs searchable",
              icon: <Search size={16} />,
              run: () => void indexMedia(),
            },
          ]
        : []),
      {
        id: "export",
        group: "Do",
        name: "Export all as Markdown",
        icon: <FolderDown size={16} />,
        run: () => void handleExportAll(),
      },
      {
        id: "whats-new",
        group: "Do",
        name: "What's New",
        icon: <Sparkle size={16} />,
        run: openWhatsNew,
      },
      {
        id: "shortcuts",
        group: "Do",
        name: "Keyboard shortcuts",
        hint: "\u2318/",
        icon: <Keyboard size={16} />,
        run: () => setShortcutsOpen(true),
      },
      {
        id: "lock",
        group: "Do",
        name: "Lock & sign out",
        icon: <Lock size={16} />,
        run: () => handleLock(),
      },
      /* Every section of Settings, by its name and by the rows inside it. */
      ...settingsSectionsFor(docMode ? "document" : "notes")
        .flatMap((group) => group.items)
        .map((item) => ({
          id: `settings:${item.id}`,
          group: "Settings",
          searchOnly: true,
          name: item.name,
          keywords: `settings ${item.keywords}`,
          icon: item.icon,
          run: () => {
            setSettingsSection(item.id);
            setSettingsOpen(true);
          },
        })),
    ];
  })();

  /* What only a typed query finds: the headings a note is divided by and the
     line a word occurs in. From memory, on every keystroke — `haystack` is
     already folded, so a note that does not hold the word costs one
     `includes`. */
  const paletteSearch = (q: string): Command[] => {
    const found: Command[] = [];
    const references = referenceSnapshot();
    let lines = 0;
    for (const entry of searchable) {
      const id = entry.note.id;
      const title = entry.note.title || "Untitled";
      const at = Date.parse(entry.note.updatedAt);
      /* A footnote's words are an attribute, outside the text the haystack
         is made of, so they are asked before it can rule the note out. */
      for (const target of references.counted.get(id)?.targets ?? []) {
        if (target.kind !== "footnote" || !fold(target.text).includes(q)) continue;
        found.push({
          id: `footnote:${id}:${target.index}`,
          group: "Footnotes",
          name: target.text.length > 90 ? `${target.text.slice(0, 89)}…` : target.text,
          hint: `${REFERENCE_WORDS[references.settings.language].footnote} ${target.number} · ${title}`,
          rank: 4,
          at,
          icon: <Footnote size={16} />,
          run: openFound(id, {
            reveal: { kind: "footnote", id: target.id, index: target.index },
          }),
        });
      }
      const mediaText = readableMedia(entry.note.content)
        .map((one) => mediaTexts.get(one.id) || "")
        .join("\n");
      if (fold(mediaText).includes(q) && mediaText)
        found.push({
          id: `media:${id}`,
          group: "Images and PDFs",
          name: title,
          snippet: snippetOf(mediaText, q) ?? undefined,
          rank: 6,
          at,
          icon: <Search size={16} />,
          run: openFound(id),
        });
      if (!derivedOf(entry.note).haystack.includes(q)) continue;
      headingsOf(entry.note.content).forEach((heading, index) => {
        if (!fold(heading.text).includes(q)) return;
        found.push({
          id: `section:${id}:${index}`,
          group: "Sections",
          name: heading.text,
          hint: title,
          rank: 3,
          at,
          icon: <Heading2 size={16} />,
          run: openFound(id, { reveal: heading.text }),
        });
      });
      // ponytail: the first thirty notes that hold the word; a ranked cap if an archive outgrows it.
      const snippet = lines < 30 ? snippetOf(entry.note.body, q) : null;
      if (snippet) {
        lines += 1;
        found.push({
          id: `text:${id}`,
          group: "Text",
          name: title,
          snippet,
          rank: 6,
          at,
          icon: <Pilcrow size={16} />,
          run: openFound(id, { reveal: snippet.match }),
        });
      }
    }
    return found;
  };

  /* The titles in the other archives, which are not in memory. Choosing one
     is changing archive, and the note is opened when the new one arrives. */
  const paletteRemote = async (q: string): Promise<Command[]> => {
    const others = spaces.filter((space) => space.archiveId !== archiveId);
    const far = await findInOtherArchives(
      others.map((space) => space.archiveId),
      q,
    );
    const folded = fold(q);
    return far.map((note) => {
      const match = nameMatch(note.title, folded);
      return {
        id: `far:${note.noteId}`,
        group: "Other groups",
        name: note.title || "Untitled",
        hint: others.find((space) => space.archiveId === note.archiveId)?.name,
        rank: match < 0 ? 2 : match,
        at: Date.parse(note.updatedAt),
        icon: <FileText size={16} />,
        run: () => {
          openInArchive(note.archiveId, note.noteId);
        },
      };
    });
  };

  return { paletteCommands, paletteSearch, paletteRemote };
}
