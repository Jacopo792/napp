import { randomUUID } from "expo-crypto";
import { useToolbarIcon } from "../icons";
/* One scope's notes, as a folder in Notes reads: grouped by date — Pinned,
 * Today, Previous 7 Days — with the system's search in the toolbar and a count
 * beside it. The groups, the order and what a scope holds are the core's
 * (`groupEntries`, `entriesInScope`), so the phone and the web list the same
 * notes in the same places.
 *
 * Every scope has the push, each with its own pair, as on the web: the list
 * deletes and archives, the Archive deletes and puts back, the Trash deletes
 * for good and restores. */
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, SectionList, StyleSheet, Text, View } from "react-native";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { derivedOf, indexOf } from "@/lib/derived";
import { fold, formatStamp } from "@/lib/format";
import {
  groupEntries,
  loadListPreferences,
  saveListPreferences,
  preferencesForFolder,
} from "@/lib/listPreferences";
import { renameFolder, removeFolder } from "@/lib/folderActs";
import { useTextPrompt } from "../TextPrompt";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import { deleteNotes } from "@/lib/supabase";
import { useArchive, usePalette } from "../archive";
import { SwipeRow, type Act } from "../SwipeRow";
import { Backdrop } from "../Backdrop";
import { Faces } from "../Avatar";
import { IconButton } from "../IconButton";
import { NotePreview } from "../NotePreview";
import { SymbolView } from "../icons";
import { shelfGround, trashGround } from "../theme";
import { attempt, Empty } from "../SettingsControls";
import { useCreateNote } from "../useCreateNote";

export default function Notes() {
  const prompt = useTextPrompt();
  const router = useRouter();
  const icon = useToolbarIcon();
  const { owner, scope, title } = useLocalSearchParams<{
    owner: string;
    scope: string;
    title: string;
  }>();
  const { session, snapshot, metaOf, act, refresh, facesOf } = useArchive();
  const palette = usePalette();
  const [query, setQuery] = useState("");
  const meta = metaOf(owner);
  const index = indexOf(meta);
  const { create, creating, importMarkdown } = useCreateNote(
    index.byFolder.has(scope) ? scope : null,
    owner,
  );
  const [stored, setStored] = useState(() => loadListPreferences(session.archiveId, owner));
  const preferences = preferencesForFolder(stored, scope);
  const sort = (patch: Partial<typeof preferences>) => {
    const next = {
      ...stored,
      folders: { ...stored.folders, [scope]: { ...preferences, ...patch } },
    };
    saveListPreferences(session.archiveId, next);
    setStored(next);
  };

  const sections = useMemo(() => {
    const theirs = (snapshot?.entries ?? []).filter((entry) => entry.note.ownerId === owner);
    let listed = entriesInScope(theirs, meta, scope);
    const q = fold(query.trim());
    if (q) listed = listed.filter((entry) => derivedOf(entry.note).haystack.includes(q));
    const pinned = new Set(meta.notes.filter((note) => note.pinned).map((note) => note.id));
    return groupEntries(listed, pinned, preferences).map((group) => ({
      key: group.id,
      title: group.label,
      data: group.entries,
    }));
  }, [snapshot, owner, meta, scope, query, preferences]);
  const count = sections.reduce((sum, section) => sum + section.data.length, 0);

  /* One row open at a time: opening one closes the rest. */
  const closers = useRef(new Map<string, () => void>());
  const register = useCallback((id: string, close: () => void) => {
    closers.current.set(id, close);
    return () => void closers.current.delete(id);
  }, []);
  const claim = useCallback((id: string) => {
    for (const [other, close] of closers.current) if (other !== id) close();
  }, []);

  const pair = (id: string): { left: Act; right: Act } => {
    const remove: Act = {
      label: "Delete",
      icon: "trash.fill",
      colour: trashGround,
      disabled: Boolean(
        index.byNote.get(id)?.lockedBy && index.byNote.get(id)?.lockedBy !== session.userId,
      ),
      run: () => act(owner, (prev) => trashNote(prev, id)),
    };
    if (scope === TRASH)
      return {
        left: {
          ...remove,
          stationary: true,
          run: () =>
            Alert.alert("Delete Forever?", "This note will be permanently deleted.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete Forever",
                style: "destructive",
                onPress: () =>
                  void attempt(async () => {
                    await deleteNotes(session, [id]);
                    refresh();
                  }),
              },
            ]),
        },
        right: {
          disabled: remove.disabled,
          label: "Restore",
          icon: "arrow.uturn.backward",
          colour: shelfGround,
          run: () => act(owner, (prev) => restoreNote(prev, id)),
        },
      };
    return {
      left: remove,
      right:
        scope === ARCHIVE
          ? {
              disabled: remove.disabled,
              label: "Put back",
              icon: "arrow.uturn.backward",
              colour: shelfGround,
              run: () => act(owner, (prev) => shelveNote(prev, id, false)),
            }
          : {
              disabled: remove.disabled,
              label: "Archive",
              icon: "archivebox.fill",
              colour: shelfGround,
              run: () => act(owner, (prev) => shelveNote(prev, id, true)),
            },
    };
  };

  /* What is true of the note wherever it is held — the web's menuNoteItems:
     pin, the write lock, and moving it — then the scope's own two acts. */
  const menu = (id: string) => {
    const row = index.byNote.get(id);
    const { left, right } = pair(id);
    return (
      <Link.Menu>
        {scope !== TRASH ? (
          <Link.MenuAction
            title={row?.pinned ? "Unpin" : "Pin"}
            icon={row?.pinned ? "pin.slash" : "pin"}
            onPress={() => act(owner, (prev) => pinNote(prev, id))}
          />
        ) : null}
        {scope !== TRASH ? (
          <Link.MenuAction
            title={row?.lockedBy === session.userId ? "Unlock" : "Lock"}
            icon={row?.lockedBy === session.userId ? "lock.open" : "lock"}
            disabled={Boolean(row?.lockedBy && row.lockedBy !== session.userId)}
            onPress={() => act(owner, (prev) => lockNote(prev, id, session.userId))}
          />
        ) : null}
        {scope !== TRASH && meta.folders.length ? (
          <Link.Menu title="Move" icon="folder">
            <Link.MenuAction
              title="No folder"
              isOn={!row?.folderId}
              onPress={() => act(owner, (prev) => fileNote(prev, id, null))}
            />
            {meta.folders.map((folder) => (
              <Link.MenuAction
                key={folder.id}
                title={folder.name}
                isOn={row?.folderId === folder.id}
                onPress={() => act(owner, (prev) => fileNote(prev, id, folder.id))}
              />
            ))}
          </Link.Menu>
        ) : null}
        <Link.MenuAction
          title={right.label}
          icon={right.icon}
          disabled={right.disabled}
          onPress={right.run}
        />
        {scope === TRASH ? (
          <Link.Menu title="Delete forever" icon="trash" destructive>
            <Link.MenuAction title="Delete forever" destructive onPress={left.run} />
          </Link.Menu>
        ) : (
          <Link.MenuAction
            title={left.label}
            icon="trash"
            destructive
            disabled={left.disabled}
            onPress={left.run}
          />
        )}
      </Link.Menu>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon={icon("ellipsis.circle")}>
          <Stack.Toolbar.MenuAction
            icon={icon("arrow.down.doc")}
            disabled={
              creating || snapshot?.members.find((member) => member.isSelf)?.role !== "editor"
            }
            onPress={importMarkdown}
          >
            Import Markdown
          </Stack.Toolbar.MenuAction>
          {meta.folders.some((folder) => folder.id === scope) ? (
            <>
              <Stack.Toolbar.MenuAction
                icon={icon("pencil")}
                onPress={() =>
                  prompt(
                    "Folder Name",
                    undefined,
                    (name) => act(owner, (prev) => renameFolder(prev, scope, name)),
                    "plain-text",
                    meta.folders.find((folder) => folder.id === scope)?.name,
                  )
                }
              >
                Rename Folder
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon={icon("folder.badge.plus")}
                onPress={() =>
                  prompt("New Folder", undefined, (name) => {
                    if (name.trim())
                      act(owner, (prev) => ({
                        ...prev,
                        folders: [
                          ...prev.folders,
                          { id: randomUUID(), name: name.trim(), parentId: scope },
                        ],
                      }));
                  })
                }
              >
                New Subfolder
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon={icon("trash")}
                destructive
                onPress={() =>
                  Alert.alert(
                    "Remove Folder?",
                    "Notes in this folder and its subfolders will remain in All Notes.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => {
                          act(owner, (prev) => removeFolder(prev, scope));
                          router.back();
                        },
                      },
                    ],
                  )
                }
              >
                Remove Folder
              </Stack.Toolbar.MenuAction>
            </>
          ) : null}
          <Stack.Toolbar.MenuAction
            icon={icon("clock")}
            onPress={() => sort({ sortBy: "updated" })}
          >
            Date Edited
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("calendar")}
            onPress={() => sort({ sortBy: "created" })}
          >
            Date Created
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("textformat")}
            onPress={() => sort({ sortBy: "title" })}
          >
            Title
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("arrow.up.arrow.down")}
            onPress={() => sort({ direction: preferences.direction === "asc" ? "desc" : "asc" })}
          >
            Reverse Order
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("calendar.badge.clock")}
            onPress={() => sort({ groupByDate: !preferences.groupByDate })}
          >
            {preferences.groupByDate ? "Hide Date Groups" : "Group by Date"}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.SearchBar
        placeholder="Search"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <Stack.Toolbar>
        <Stack.Toolbar.SearchBarSlot />
        <Stack.Toolbar.Spacer />
        {scope !== TRASH && scope !== ARCHIVE ? (
          <Stack.Toolbar.View>
            <IconButton
              icon="square.and.pencil"
              label="New note"
              onPress={create}
              disabled={creating}
            />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      <SectionList
        sections={sections}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Empty label={query ? "No Results" : "No Notes"} />}
        ListFooterComponent={
          <Text style={[styles.count, { color: palette.ink3, textAlign: "center", padding: 24 }]}>
            {count === 1 ? "1 Note" : `${count} Notes`}
          </Text>
        }
        onRefresh={refresh}
        refreshing={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyExtractor={(entry) => entry.note.id}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.heading, { color: palette.ink }]}>{section.title}</Text>
        )}
        renderItem={({ item, index: at, section }) => {
          const id = item.note.id;
          const row = index.byNote.get(id);
          const acts = pair(id);
          const faces = facesOf(id);
          return (
            <SwipeRow
              href={{ pathname: "/note/[id]", params: { id } }}
              rightward={acts.left}
              leftward={acts.right}
              menu={menu(id)}
              preview={<NotePreview note={item.note} faces={faces} />}
              first={at === 0}
              last={at === section.data.length - 1}
              onClaim={() => claim(id)}
              register={(close) => register(id, close)}
            >
              <View style={[styles.text]}>
                <View style={styles.titleLine}>
                  <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
                    {item.note.title || "Untitled"}
                  </Text>
                  {row?.lockedBy ? (
                    <SymbolView name="lock.fill" size={13} tintColor={palette.ink3} />
                  ) : null}
                  {row?.pinned ? (
                    <SymbolView name="pin.fill" size={13} tintColor={palette.accent} />
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Faces faces={faces} size={22} ring={palette.paper} max={2} />
                </View>
                <Text style={[styles.preview, { color: palette.ink3 }]} numberOfLines={1}>
                  <Text style={{ color: palette.ink2, fontWeight: "500" }}>
                    {formatStamp(item.note.updatedAt)}{" "}
                  </Text>
                  {derivedOf(item.note).preview || "No additional text"}
                </Text>
              </View>
            </SwipeRow>
          );
        }}
      />
      <Backdrop />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  count: { fontSize: 13, fontWeight: "500" },
  text: { paddingVertical: 16, paddingLeft: 20, paddingRight: 18, gap: 5 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 22 },
  title: { flexShrink: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  preview: { fontSize: 15 },
});
