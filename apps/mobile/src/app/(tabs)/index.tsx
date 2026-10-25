import { NotePicture } from "../../NotePicture";
/* Home, as Jacopo set it out (18 October 2026): a notes app's front page in
 * the shapes of Revolut and Shop, never a bank's. Under the bar — the face,
 * the search, the + that makes things — whose notes these are, compact; then
 * the note to carry on with as one large card standing on the reader's
 * picture; the pinned notes in a row that scrolls sideways; every folder as
 * a Shop feed card with its latest notes inside it; and the shelf and the bin
 * at the foot.
 *
 * A folder card swipes as a note row does, with its own pair: right to remove
 * the folder (its notes stay, unfiled), left to file everything in it away.
 * Its ⋯ and a long press offer the rest. */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { randomUUID } from "expo-crypto";
import { derivedOf, indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import { formatStamp } from "@/lib/format";
import { removeFolder, renameFolder, shelveFolder } from "@/lib/folderActs";
import { ALL, ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import type { Folder } from "@/lib/types";
import { useChoice, useTextPrompt } from "../../TextPrompt";
import { useArchive, usePalette } from "../../archive";
import { Faces } from "../../Avatar";
import { Group, Press, Row, quiet } from "../../Grouped";
import { SwipeRow } from "../../SwipeRow";
import { NoteLink } from "../../NoteLink";
import { ZoomLink } from "../../SettingsControls";
import { shelfGround, trashGround } from "../../theme";
import { useCreateNote } from "../../useCreateNote";
import { NotebookPage, NotebookPages, WhoseSwitch } from "../../WhoseSwitch";
import { SymbolView } from "../../icons";
import {
  BAR,
  Card,
  Heading,
  Reveal,
  RoundButton,
  SkeletonCard,
  TabPage,
  useArrival,
} from "../../Chrome";

/** Folders in the order the web draws them: each followed by its children. */
function nested(folders: Folder[]): Folder[] {
  const known = new Set(folders.map((folder) => folder.id));
  const out: Folder[] = [];
  const walk = (parent: string | null) => {
    for (const folder of folders) {
      const under = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
      if (under !== parent) continue;
      out.push(folder);
      walk(folder.id);
    }
  };
  walk(null);
  return out;
}

const newest = (entries: NoteEntry[]) =>
  [...entries].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));

export default function Home() {
  const prompt = useTextPrompt();
  const choose = useChoice();
  const inset = useSafeAreaInsets();
  const { session, snapshot, error, act, refresh, present } = useArchive();
  const palette = usePalette();
  const editor = snapshot?.members.find((member) => member.isSelf)?.role === "editor";
  const arrival = useArrival(Boolean(snapshot));

  const members = [...(snapshot?.members ?? [])].sort((a, b) =>
    a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1,
  );
  const [showing, setShowing] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const shown = members.find((member) => member.userId === showing) ?? members[0];
  const nameOf = (member: (typeof members)[number]) =>
    member.isSelf ? "You" : member.nickname || "Partner";
  const whose = members.map((member) => ({
    face: {
      userId: member.userId,
      /* Your own face is the one the bar draws: your name's letter, or the
         silhouette while you have none — never the "Y" of "You". */
      name: member.isSelf ? member.nickname : nameOf(member),
      avatarObject: member.avatarObject,
      online: !member.isSelf && present.has(member.userId),
    },
    email: member.isSelf ? session.email : undefined,
    label: member.isSelf ? "You" : nameOf(member).split(/\s+/)[0],
    title: member.isSelf ? "Your Notes" : `${nameOf(member)}’s Notes`,
  }));
  const owner = shown?.userId ?? session.userId;
  const pick = (userId: string) => {
    const next = members.findIndex((member) => member.userId === userId);
    const previous = members.findIndex((member) => member.userId === owner);
    if (next < 0 || next === previous) return;
    setShowing(userId);
  };
  const { create, creating, importMarkdown } = useCreateNote(null, owner);

  const newFolder = (parentId: string | null = null) =>
    prompt(parentId ? "New Subfolder" : "New Folder", undefined, (name) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      act(owner, (prev) => ({
        ...prev,
        folders: [...prev.folders, { id: randomUUID(), name: trimmed, parentId }],
      }));
    });

  return (
    <TabPage
      onRefresh={refresh}
      reach={inset.top + BAR + 380}
      right={
        <RoundButton
          icon="plus"
          label="New"
          disabled={!editor || creating}
          onPress={() =>
            choose("Create", [
              {
                label: "New Note",
                detail: "Start with a blank page",
                icon: "square.and.pencil",
                run: create,
              },
              {
                label: "New Folder",
                detail: "Give your notes a home",
                icon: "folder.badge.plus",
                run: () => newFolder(),
              },
              {
                label: "Import Markdown",
                detail: "Bring a .md file into your notes",
                icon: "arrow.down.doc",
                run: importMarkdown,
              },
            ])
          }
        />
      }
    >
      {shown && members.length > 1 ? (
        <View style={styles.whoseRow}>
          <WhoseSwitch options={whose} selected={shown.userId} onChoose={pick} />
        </View>
      ) : null}
      {error ? (
        <Text style={{ color: palette.danger, textAlign: "center", padding: 24 }}>{error}</Text>
      ) : null}
      {!snapshot ? (
        <>
          <SkeletonCard rows={2} style={{ height: 210 }} />
          <SkeletonCard rows={3} />
        </>
      ) : (
        <Animated.View entering={arrival}>
          <NotebookPages height={heights[owner] ?? 0}>
            {members.map((member) => {
              const visible = member.userId === owner;
              return (
                <NotebookPage
                  key={member.userId}
                  active={visible}
                  onLayout={(event) => {
                    const height = event.nativeEvent.layout.height;
                    setHeights((previous) =>
                      previous[member.userId] === height
                        ? previous
                        : { ...previous, [member.userId]: height },
                    );
                  }}
                >
                  <MemberContent owner={member.userId} />
                </NotebookPage>
              );
            })}
          </NotebookPages>
        </Animated.View>
      )}
    </TabPage>
  );
}

/* Keep the native trees laid out at full width. Activity disconnects and
 * reconnects effects when switching, including native preview registrations;
 * display:none also invalidates their layout. Opacity leaves both intact.
 * Only the selected page contributes its measured height to the scroll view.
 * The inactive page receives neither touches nor accessibility focus. */
const MemberContent = memo(function MemberContent({ owner }: { owner: string }) {
  const prompt = useTextPrompt();
  const choose = useChoice();
  const { session, snapshot, metaOf, act, facesOf } = useArchive();
  const palette = usePalette();
  const editor = snapshot?.members.find((member) => member.isSelf)?.role === "editor";
  const { create } = useCreateNote(null, owner);
  /* One card open at a time across the whole screen. */
  const closers = useRef(new Map<string, () => void>());
  const register = useCallback((id: string, close: () => void) => {
    closers.current.set(id, close);
    return () => void closers.current.delete(id);
  }, []);
  const claim = useCallback((id: string) => {
    for (const [other, close] of closers.current) if (other !== id) close();
  }, []);

  const newFolder = (parentId: string | null = null) =>
    prompt(parentId ? "New Subfolder" : "New Folder", undefined, (name) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      act(owner, (prev) => ({
        ...prev,
        folders: [...prev.folders, { id: randomUUID(), name: trimmed, parentId }],
      }));
    });
  const remove = (folder: Folder) =>
    Alert.alert(`Remove “${folder.name}”?`, "Its notes stay in All Notes.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => act(owner, (prev) => removeFolder(prev, folder.id)),
      },
    ]);
  const rename = (folder: Folder) =>
    prompt(
      "Folder Name",
      undefined,
      (name) => act(owner, (prev) => renameFolder(prev, folder.id, name)),
      "plain-text",
      folder.name,
    );

  const meta = metaOf(owner);
  const index = indexOf(meta);
  const theirs = (snapshot?.entries ?? []).filter((entry) => entry.note.ownerId === owner);
  const inScope = (scope: string) => entriesInScope(theirs, meta, scope);
  const all = newest(inScope(ALL));
  const latest = all[0];
  const pinned = all.filter((entry) => index.byNote.get(entry.note.id)?.pinned);
  const folderName = new Map(meta.folders.map((folder) => [folder.id, folder.name]));
  const href = (scope: string, title: string) =>
    ({ pathname: "/notes", params: { owner, scope, title } }) as const;
  const where = (entry: NoteEntry) =>
    [
      folderName.get(index.byNote.get(entry.note.id)?.folderId ?? ""),
      formatStamp(entry.note.updatedAt),
    ]
      .filter(Boolean)
      .join(" · ");

  /* Nothing written yet: the first line, waiting. Your page only — a
     partner's empty page is simply empty. */
  if (!theirs.length)
    return owner === session.userId && editor ? (
      <View style={styles.continue}>
        <Press
          feedback="scale"
          accessibilityRole="button"
          accessibilityLabel="Write something"
          onPress={create}
        >
          <Card style={[styles.continueCard, styles.emptyCard]}>
            <Text style={[styles.label, { color: palette.ink3 }]}>Continue Writing</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.continueTitle, { color: palette.ink4 }]}>Write something</Text>
              <Caret />
            </View>
            <View style={[styles.foot, { marginTop: "auto" }]}>
              <View style={{ flex: 1 }} />
              <Arrow accent />
            </View>
          </Card>
        </Press>
      </View>
    ) : null;

  return (
    <View>
      {latest ? (
        <View style={styles.continue}>
          <NoteLink entry={latest} feedback="scale">
            <Card style={styles.continueCard}>
              <Text style={[styles.label, { color: palette.ink3 }]}>Continue Writing</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <NotePicture note={latest.note} size={40} />
                <Text
                  style={[styles.continueTitle, { color: palette.ink, flex: 1 }]}
                  numberOfLines={2}
                >
                  {latest.note.title || "Untitled"}
                </Text>
              </View>
              <Text style={[styles.continueText, { color: palette.ink2 }]} numberOfLines={3}>
                {derivedOf(latest.note).preview || "No additional text"}
              </Text>
              <View style={styles.foot}>
                <Text style={{ flex: 1, color: palette.ink3, fontSize: 13 }} numberOfLines={1}>
                  {where(latest)}
                </Text>
                <Faces faces={facesOf(latest.note.id)} size={24} ring={palette.paper} max={3} />
                <Arrow />
              </View>
            </Card>
          </NoteLink>
        </View>
      ) : null}
      {pinned.length ? (
        <View>
          <Heading>Pinned</Heading>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 18 }}
          >
            {pinned.map((entry) => (
              <NoteLink key={entry.note.id} entry={entry} feedback="scale" style={{ width: 168 }}>
                <Card radius={20} style={styles.pin}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <NotePicture note={entry.note} size={24} />
                    <Text
                      style={{ flex: 1, color: palette.ink, fontSize: 15, fontWeight: "600" }}
                      numberOfLines={2}
                    >
                      {entry.note.title || "Untitled"}
                    </Text>
                  </View>
                  <Text
                    style={{ color: palette.ink3, fontSize: 13, lineHeight: 17 }}
                    numberOfLines={2}
                  >
                    {derivedOf(entry.note).preview}
                  </Text>
                </Card>
              </NoteLink>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {meta.folders.length ? (
        <View>
          <Heading>Folders</Heading>
        </View>
      ) : null}
      {nested(meta.folders).map((folder) => {
        const inside = newest(inScope(folder.id));
        const parent = folder.parentId ? folderName.get(folder.parentId) : undefined;
        const menu = () =>
          choose(folder.name, [
            { label: "Rename", run: () => rename(folder), disabled: !editor },
            { label: "New Subfolder", run: () => newFolder(folder.id), disabled: !editor },
            {
              label: "Archive Notes",
              run: () => act(owner, (prev) => shelveFolder(prev, folder.id)),
              disabled: !editor || inside.length === 0,
            },
            {
              label: "Remove Folder",
              run: () => remove(folder),
              destructive: true,
              disabled: !editor,
            },
          ]);
        return (
          <View key={folder.id}>
            <Reveal style={{ marginBottom: 14 }}>
              <SwipeRow
                href={href(folder.id, folder.name)}
                first
                last
                glass
                onClaim={() => claim(folder.id)}
                register={(close) => register(folder.id, close)}
                trailing={
                  editor
                    ? [
                        {
                          label: "Archive",
                          icon: "archivebox.fill",
                          stationary: true,
                          disabled: inside.length === 0,
                          run: () => act(owner, (prev) => shelveFolder(prev, folder.id)),
                        },
                        {
                          label: "Remove",
                          icon: "trash.fill",
                          destructive: true,
                          stationary: true,
                          run: () => remove(folder),
                        },
                      ]
                    : undefined
                }
                menu={
                  <Link.Menu>
                    <Link.MenuAction
                      title="Rename"
                      icon="pencil"
                      disabled={!editor}
                      onPress={() => rename(folder)}
                    />
                    <Link.MenuAction
                      title="New Subfolder"
                      icon="folder.badge.plus"
                      disabled={!editor}
                      onPress={() => newFolder(folder.id)}
                    />
                    <Link.MenuAction
                      title="Archive Notes"
                      icon="archivebox"
                      disabled={!editor || inside.length === 0}
                      onPress={() => act(owner, (prev) => shelveFolder(prev, folder.id))}
                    />
                    <Link.MenuAction
                      title="Remove Folder"
                      icon="trash"
                      destructive
                      disabled={!editor}
                      onPress={() => remove(folder)}
                    />
                  </Link.Menu>
                }
              >
                <View style={styles.folder}>
                  <View style={styles.folderHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.folderName, { color: palette.ink }]} numberOfLines={1}>
                        {folder.name}
                      </Text>
                      {parent ? (
                        <Text style={{ color: palette.ink3, fontSize: 13 }} numberOfLines={1}>
                          in {parent}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${folder.name} actions`}
                      hitSlop={10}
                      onPress={menu}
                      style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]}
                    >
                      <SymbolView
                        name="ellipsis"
                        size={18}
                        weight="bold"
                        tintColor={palette.ink2}
                      />
                    </Pressable>
                  </View>
                  {inside.length ? (
                    <View
                      style={[
                        styles.inside,
                        { backgroundColor: palette.dark ? "#ffffff0d" : "#0000000a" },
                      ]}
                    >
                      {inside.slice(0, 3).map((entry) => (
                        <NoteLink key={entry.note.id} entry={entry} style={styles.insideRow}>
                          <NotePicture note={entry.note} size={24} />
                          <Text
                            style={{
                              flex: 1,
                              color: palette.ink,
                              fontSize: 15,
                              fontWeight: "500",
                            }}
                            numberOfLines={1}
                          >
                            {entry.note.title || "Untitled"}
                          </Text>
                          <Text style={{ color: palette.ink3, fontSize: 13 }}>
                            {formatStamp(entry.note.updatedAt)}
                          </Text>
                        </NoteLink>
                      ))}
                    </View>
                  ) : null}
                  <View style={styles.foot}>
                    <Text style={{ flex: 1, color: palette.ink3, fontSize: 13 }}>
                      {inside.length === 1 ? "1 note" : `${inside.length} notes`}
                    </Text>
                    <Arrow />
                  </View>
                </View>
              </SwipeRow>
            </Reveal>
          </View>
        );
      })}
      {/* Keyed by whose page it is: a reveal measures itself on mount
              and on scroll, and the turn moves it without either. */}
      <View>
        <Reveal>
          <Group>
            <ZoomLink href={href(ARCHIVE, "Archive")}>
              <Row
                icon="archivebox.fill"
                label="Archive"
                detail={inScope(ARCHIVE).length}
                tint={shelfGround}
              />
            </ZoomLink>
            <ZoomLink href={href(TRASH, "Recently Deleted")}>
              <Row
                icon="trash.fill"
                fill={trashGround}
                label="Recently Deleted"
                detail={inScope(TRASH).length}
                last
              />
            </ZoomLink>
          </Group>
        </Reveal>
      </View>
    </View>
  );
});

/** Shop's round arrow at the foot of a card: this goes somewhere. */
function Arrow({ accent = false }: { accent?: boolean }) {
  const palette = usePalette();
  return (
    <View style={[styles.arrow, { backgroundColor: accent ? palette.accent : quiet(palette) }]}>
      <SymbolView
        name="arrow.right"
        size={15}
        weight="bold"
        tintColor={accent ? palette.onAccent : palette.ink}
      />
    </View>
  );
}

/** A text field's caret, blinking on the UI thread; still under reduced motion. */
function Caret() {
  const palette = usePalette();
  const still = useReducedMotion();
  const shown = useSharedValue(1);
  useEffect(() => {
    if (still) return;
    shown.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 530 }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 530 }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
    );
  }, [still, shown]);
  const blink = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View
      style={[
        { width: 2, height: 28, marginLeft: 2, borderRadius: 1, backgroundColor: palette.accent },
        blink,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  whoseRow: { marginHorizontal: 16, marginTop: 2, marginBottom: 14 },
  continue: { marginHorizontal: 16, marginBottom: 16 },
  continueCard: { padding: 18, gap: 6 },
  emptyCard: { minHeight: 196 },
  label: { fontSize: 13, fontWeight: "600" },
  continueTitle: { fontSize: 24, fontWeight: "700", letterSpacing: -0.6, lineHeight: 29 },
  continueText: { fontSize: 15, lineHeight: 21 },
  foot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  pin: { height: 112, padding: 14, gap: 6 },
  folder: { padding: 16 },
  folderHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  folderName: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  more: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  inside: { borderRadius: 16, borderCurve: "continuous", overflow: "hidden", paddingVertical: 4 },
  insideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
