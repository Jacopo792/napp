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
import { Alert, SectionList, StyleSheet, Text } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { derivedOf, indexOf } from "@/lib/derived";
import { fold, formatStamp } from "@/lib/format";
import {
  groupEntries,
  loadListPreferences,
  saveListPreferences,
  preferencesForFolder,
} from "@/lib/listPreferences";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import { deleteNotes } from "@/lib/supabase";
import { useArchive, usePalette } from "../archive";
import { SwipeRow, type Act } from "../SwipeRow";
import { shelfGround, trashGround } from "../theme";
import { attempt, Empty } from "../SettingsControls";
import { useCreateNote } from "../useCreateNote";

export default function Notes() {
  const icon = useToolbarIcon();
  const { owner, scope, title } = useLocalSearchParams<{
    owner: string;
    scope: string;
    title: string;
  }>();
  const { session, snapshot, metaOf, act, refresh } = useArchive();
  const palette = usePalette();
  const [query, setQuery] = useState("");
  const meta = metaOf(owner);
  const index = indexOf(meta);
  const { create, creating } = useCreateNote(index.byFolder.has(scope) ? scope : null);
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
        <Stack.Toolbar.Spacer />
        {owner === session.userId && scope !== TRASH && scope !== ARCHIVE ? (
          <Stack.Toolbar.Button
            icon={icon("square.and.pencil")}
            onPress={create}
            disabled={creating}
            accessibilityLabel="New Note"
          />
        ) : null}
      </Stack.Toolbar>
      <SectionList
        sections={sections}
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
          return (
            <SwipeRow
              href={{ pathname: "/note/[id]", params: { id } }}
              title={item.note.title || "Untitled"}
              stamp={formatStamp(item.note.updatedAt)}
              preview={derivedOf(item.note).preview}
              pinned={row?.pinned}
              locked={Boolean(row?.lockedBy)}
              {...pair(id)}
              menu={menu(id)}
              first={at === 0}
              last={at === section.data.length - 1}
              onClaim={() => claim(id)}
              register={(close) => register(id, close)}
            />
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: "700",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  count: { fontSize: 13, fontWeight: "500" },
});
