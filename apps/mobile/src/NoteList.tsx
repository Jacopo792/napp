import { randomUUID } from "expo-crypto";
import { useToolbarIcon } from "./icons";
/* One scope's notes, grouped by date — Pinned, Today, Previous 7 Days — each
 * group a card with its name small and grey inside it, as Revolut's lists
 * are. The same list is the Notes tab (`tab`, under the page's own bar, its
 * pill in the bar opening the search of everything) and a folder pushed from
 * Home (its title and a filter of this folder in the page, its acts in the round button of the system's bar). Sorting is
 * Shop's chip row over the list, in both. The groups, the order and what a scope holds are the core's
 * (`groupEntries`, `entriesInScope`), so the phone and the web list the same
 * notes in the same places.
 *
 * Every scope has the push, each with its own pair, as on the web: the list
 * deletes and archives, the Archive deletes and puts back, the Trash deletes
 * for good and restores. */
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Platform, SectionList, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { derivedOf, indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import { fold, formatStamp } from "@/lib/format";
import {
  groupEntries,
  loadListPreferences,
  saveListPreferences,
  preferencesForFolder,
} from "@/lib/listPreferences";
import { renameFolder, removeFolder } from "@/lib/folderActs";
import { pinNote } from "@/lib/noteActs";
import { useChoice, useTextPrompt } from "./TextPrompt";
import { ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import { useArchive, usePalette } from "./archive";
import { SwipeRow } from "./SwipeRow";
import { useNoteActs } from "./NoteLink";
import { Backdrop, useCard } from "./Backdrop";
import { Faces } from "./Avatar";
import { NotePreview } from "./NotePreview";
import { SymbolView } from "./icons";
import { Empty } from "./SettingsControls";
import { useCreateNote } from "./useCreateNote";
import {
  BAR,
  BottomFade,
  Chips,
  PageTitle,
  Reveal,
  RevealScroll,
  RoundButton,
  SearchPill,
  SkeletonCard,
  TopBar,
  usePageScroll,
} from "./Chrome";
import { CARD_RADIUS } from "./Grouped";

type Day = { key: string; title: string; data: NoteEntry[] };
const Sections = Animated.createAnimatedComponent(SectionList<NoteEntry, Day>);

export function NoteList({
  owner,
  scope,
  title,
  tab,
}: {
  owner: string;
  scope: string;
  title: string;
  /** The Notes tab rather than a pushed folder. */
  tab?: boolean;
}) {
  const prompt = useTextPrompt();
  const choose = useChoice();
  const router = useRouter();
  const icon = useToolbarIcon();
  const { session, snapshot, metaOf, act, refresh, facesOf } = useArchive();
  const palette = usePalette();
  const { card } = useCard();
  const inset = useSafeAreaInsets();
  /* iOS insets a scroller under a transparent bar by itself; Android does not. */
  const header = useHeaderHeight();
  const { scroll, onScroll } = usePageScroll();
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

  const { pair, menu, hold } = useNoteActs(scope);

  const editor = snapshot?.members.find((member) => member.isSelf)?.role === "editor";
  const canCreate = scope !== TRASH && scope !== ARCHIVE;
  const inFolder = meta.folders.some((folder) => folder.id === scope);
  const chips = (
    <Chips
      items={[
        ...(
          [
            ["updated", "Edited", "clock"],
            ["created", "Created", "calendar"],
            ["title", "Title", "textformat"],
          ] as const
        ).map(([id, label, glyph]) => ({
          id,
          label,
          icon: glyph,
          on: preferences.sortBy === id,
          onPress: () => sort({ sortBy: id }),
        })),
        {
          id: "reverse",
          label: "Reversed",
          icon: "arrow.up.arrow.down",
          on: preferences.direction === "asc",
          onPress: () => sort({ direction: preferences.direction === "asc" ? "desc" : "asc" }),
        },
        {
          id: "dates",
          label: "By Date",
          icon: "calendar.badge.clock",
          on: preferences.groupByDate,
          onPress: () => sort({ groupByDate: !preferences.groupByDate }),
        },
      ]}
    />
  );
  const search = <SearchPill value={query} onChange={setQuery} />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      {tab ? null : (
        <Stack.Toolbar placement="right" tintColor={palette.ink}>
          {canCreate ? (
            <Stack.Toolbar.Button
              icon={icon("square.and.pencil")}
              accessibilityLabel="New Note"
              disabled={creating || !editor}
              onPress={create}
            />
          ) : null}
          <Stack.Toolbar.Button
            icon={icon("ellipsis")}
            accessibilityLabel="Folder actions"
            disabled={!editor || creating}
            onPress={() =>
              choose(
                inFolder ? title : "Notes",
                [
                  {
                    label: "Import Markdown",
                    icon: "arrow.down.doc",
                    detail: "Bring a .md file into this folder",
                    disabled: !canCreate,
                    run: importMarkdown,
                  },
                  ...(inFolder
                    ? [
                        {
                          label: "Rename Folder",
                          icon: "pencil" as const,
                          run: () =>
                            prompt(
                              "Folder Name",
                              undefined,
                              (name) => act(owner, (prev) => renameFolder(prev, scope, name)),
                              "plain-text",
                              meta.folders.find((folder) => folder.id === scope)?.name,
                            ),
                        },
                        {
                          label: "New Subfolder",
                          icon: "folder.badge.plus" as const,
                          run: () =>
                            prompt("New Subfolder", undefined, (name) => {
                              if (name.trim())
                                act(owner, (prev) => ({
                                  ...prev,
                                  folders: [
                                    ...prev.folders,
                                    { id: randomUUID(), name: name.trim(), parentId: scope },
                                  ],
                                }));
                            }),
                        },
                        {
                          label: "Remove Folder",
                          icon: "trash" as const,
                          detail: "Your notes stay in All Notes",
                          destructive: true,
                          run: () =>
                            Alert.alert(
                              "Remove Folder?",
                              "Notes in this folder and its subfolders stay in All Notes.",
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
                            ),
                        },
                      ]
                    : []),
                ],
                undefined,
                "toolbar",
              )
            }
          />
        </Stack.Toolbar>
      )}
      <Backdrop />
      <RevealScroll value={scroll}>
        <Sections
          sections={sections}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior={tab ? "never" : "automatic"}
          contentContainerStyle={{
            paddingTop: tab ? inset.top + BAR + 8 : (Platform.OS === "android" ? header : 0) + 8,
            paddingBottom: tab ? 140 : 40,
          }}
          ListHeaderComponent={
            tab ? (
              chips
            ) : (
              <>
                <PageTitle>{title}</PageTitle>
                <View style={{ marginHorizontal: 16, marginBottom: 14, flexDirection: "row" }}>
                  {search}
                </View>
                {chips}
              </>
            )
          }
          ListEmptyComponent={
            snapshot ? (
              <Empty label={query ? "No Results" : "No Notes"} />
            ) : (
              <>
                <SkeletonCard rows={4} />
                <SkeletonCard rows={3} />
              </>
            )
          }
          ListFooterComponent={
            count ? (
              <Text style={[styles.count, { color: palette.ink3 }]}>
                {count === 1 ? "1 Note" : `${count} Notes`}
              </Text>
            ) : undefined
          }
          onRefresh={refresh}
          refreshing={false}
          progressViewOffset={tab ? inset.top + BAR : undefined}
          keyExtractor={(entry) => entry.note.id}
          stickySectionHeadersEnabled={false}
          /* The air between two cards belongs to the heading, never to a
             SectionSeparatorComponent: a section's cells keep the separator
             props they were first rendered with, so a note moving into the
             first row of a group kept the gap it had as a second row, and
             the card broke in two under its title. */
          renderSectionHeader={({ section }) => (
            <View
              style={[
                styles.heading,
                { backgroundColor: card, marginTop: section === sections[0] ? 0 : 16 },
              ]}
            >
              <Text style={[styles.headingText, { color: palette.ink3 }]}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, index: at, section }) => {
            const id = item.note.id;
            const stamp = formatStamp(
              preferences.sortBy === "created" ? item.note.createdAt : item.note.updatedAt,
            );
            const row = index.byNote.get(id);
            const acts = pair(item);
            const faces = facesOf(id);
            return (
              <Reveal row>
                <SwipeRow
                  href={{ pathname: "/note/[id]", params: { id } }}
                  trailing={[acts.right, acts.left]}
                  leading={
                    scope === TRASH
                      ? undefined
                      : {
                          label: row?.pinned ? "Unpin" : "Pin",
                          icon: row?.pinned ? "pin.slash.fill" : "pin.fill",
                          stationary: true,
                          disabled: acts.left.disabled,
                          run: () =>
                            act(item.note.ownerId ?? session.userId, (prev) => pinNote(prev, id)),
                        }
                  }
                  menu={menu(item)}
                  onHold={() => hold(item)}
                  preview={<NotePreview note={item.note} faces={faces} />}
                  first={false}
                  last={at === section.data.length - 1}
                  onClaim={() => claim(id)}
                  register={(close) => register(id, close)}
                >
                  <View style={styles.text}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
                        {item.note.title || "Untitled"}
                      </Text>
                      {row?.lockedBy ? (
                        <SymbolView name="lock.fill" size={13} tintColor={palette.ink3} />
                      ) : null}
                      {row?.pinned ? (
                        <SymbolView name="pin.fill" size={13} tintColor={palette.ink2} />
                      ) : null}
                      <View style={{ flex: 1 }} />
                      {stamp !== section.title ? (
                        <Text style={[styles.stamp, { color: palette.ink3 }]}>{stamp}</Text>
                      ) : null}
                    </View>
                    <View style={styles.titleLine}>
                      <Text
                        style={[styles.preview, { color: palette.ink3, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {derivedOf(item.note).preview || "No additional text"}
                      </Text>
                      <View
                        style={{
                          width: 40,
                          height: 22,
                          marginLeft: 8,
                          alignItems: "flex-end",
                          justifyContent: "center",
                        }}
                      >
                        <Faces faces={faces} size={20} ring={card} max={2} />
                      </View>
                    </View>
                  </View>
                </SwipeRow>
              </Reveal>
            );
          }}
        />
      </RevealScroll>
      {tab ? (
        <>
          <BottomFade />
          <TopBar
            scroll={scroll}
            search={<SearchPill onPress={() => router.push("/search")} />}
            right={
              <RoundButton
                icon="square.and.pencil"
                label="New Note"
                disabled={creating || !editor}
                onPress={create}
              />
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginHorizontal: 16,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderCurve: "continuous",
    paddingTop: 16,
    paddingBottom: 2,
    paddingHorizontal: 20,
  },
  headingText: { fontSize: 13, fontWeight: "600" },
  count: { fontSize: 13, fontWeight: "500", textAlign: "center", padding: 24 },
  text: { paddingVertical: 13, paddingLeft: 20, paddingRight: 18, gap: 4 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 20 },
  title: { flexShrink: 1, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  stamp: { fontSize: 13 },
  preview: { fontSize: 14 },
});
