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
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
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
import { Group, Row, quiet } from "../../Grouped";
import { SwipeRow } from "../../SwipeRow";
import { NoteLink } from "../../NoteLink";
import { ZoomLink } from "../../SettingsControls";
import { glide, shelfGround, trashGround } from "../../theme";
import { useCreateNote } from "../../useCreateNote";
import { WhoseSwitch } from "../../WhoseSwitch";
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
  const { session, snapshot, error, metaOf, act, refresh, present, facesOf } = useArchive();
  const palette = usePalette();
  const editor = snapshot?.members.find((member) => member.isSelf)?.role === "editor";
  const arrival = useArrival(Boolean(snapshot));

  /* One card open at a time across the whole screen. */
  const closers = useRef(new Map<string, () => void>());
  const register = useCallback((id: string, close: () => void) => {
    closers.current.set(id, close);
    return () => void closers.current.delete(id);
  }, []);
  const claim = useCallback((id: string) => {
    for (const [other, close] of closers.current) if (other !== id) close();
  }, []);

  const members = [...(snapshot?.members ?? [])].sort((a, b) =>
    a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1,
  );
  /* Two answers to "whose": the one the switch has gone to, and the one the
     page is drawing — they differ for the moment the old page is leaving. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const shown = members.find((member) => member.userId === showing) ?? members[0];
  const picked = members.find((member) => member.userId === chosen) ?? shown;
  const nameOf = (member: (typeof members)[number]) =>
    member.isSelf ? "You" : member.nickname || "Partner";
  const whose = members.map((member) => ({
    face: {
      userId: member.userId,
      name: nameOf(member),
      avatarObject: member.avatarObject,
      online: !member.isSelf && present.has(member.userId),
    },
    email: member.isSelf ? session.email : undefined,
    label: member.isSelf ? "You" : nameOf(member).split(/\s+/)[0],
    title: member.isSelf ? "Your Notes" : `${nameOf(member)}’s Notes`,
  }));
  /* The page is not remounted when the face turns: the old page slides
     ~24pt away from the side being gone to and fades, then the new one comes
     in from that side on the no-overshoot spring, its cards a beat apart
     (`Turning`). All of it on the UI thread; a tap mid-turn takes the page
     from wherever it is, and only the last face asked for is drawn. */
  const turnX = useSharedValue(0);
  const turnO = useSharedValue(1);
  const arrive = useCallback(
    (userId: string, direction: number) => {
      setShowing(userId);
      turnX.value = direction * 24;
      turnX.value = withSpring(0, glide);
      /* One frame late, so the old page never shows again at the new side. */
      turnO.value = withDelay(
        32,
        withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
      );
    },
    [turnX, turnO],
  );
  const pick = (userId: string) => {
    setChosen(userId);
    const from = members.findIndex((member) => member.userId === shown?.userId);
    const to = members.findIndex((member) => member.userId === userId);
    const direction = to >= from ? 1 : -1;
    const out = { duration: 150, easing: Easing.in(Easing.quad) };
    turnX.value = withTiming(-direction * 24, out);
    turnO.value = withTiming(0, out, (done) => {
      "worklet";
      if (done) scheduleOnRN(arrive, userId, direction);
    });
  };
  const owner = shown?.userId ?? session.userId;
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
          <WhoseSwitch options={whose} selected={picked.userId} onChoose={pick} />
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
          {latest ? (
            <Turning at={0} x={turnX} o={turnO} style={styles.continue}>
              <NoteLink entry={latest} zoom feedback="scale">
                <Card style={styles.continueCard}>
                  <Text style={[styles.label, { color: palette.ink3 }]}>Continue Writing</Text>
                  <Text style={[styles.continueTitle, { color: palette.ink }]} numberOfLines={2}>
                    {latest.note.title || "Untitled"}
                  </Text>
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
            </Turning>
          ) : null}
          {pinned.length ? (
            <Turning at={1} x={turnX} o={turnO}>
              <Heading>Pinned</Heading>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 18 }}
              >
                {pinned.map((entry) => (
                  <NoteLink
                    key={entry.note.id}
                    entry={entry}
                    feedback="scale"
                    style={{ width: 168 }}
                  >
                    <Card radius={20} style={styles.pin}>
                      <Text
                        style={{ color: palette.ink, fontSize: 15, fontWeight: "600" }}
                        numberOfLines={2}
                      >
                        {entry.note.title || "Untitled"}
                      </Text>
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
            </Turning>
          ) : null}
          {meta.folders.length ? (
            <Turning at={2} x={turnX} o={turnO}>
              <Heading>Folders</Heading>
            </Turning>
          ) : null}
          {nested(meta.folders).map((folder, folderAt) => {
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
              <Turning key={`${owner}:${folder.id}`} at={3 + folderAt} x={turnX} o={turnO}>
                <Reveal style={{ marginBottom: 14 }}>
                  <SwipeRow
                    href={href(folder.id, folder.name)}
                    first
                    last
                    glass
                    onClaim={() => claim(folder.id)}
                    register={(close) => register(folder.id, close)}
                    rightward={
                      editor
                        ? {
                            label: "Remove",
                            icon: "trash.fill",
                            colour: trashGround,
                            stationary: true,
                            run: () => remove(folder),
                          }
                        : undefined
                    }
                    leftward={
                      editor
                        ? {
                            label: "Archive",
                            icon: "archivebox.fill",
                            colour: shelfGround,
                            stationary: true,
                            disabled: inside.length === 0,
                            run: () => act(owner, (prev) => shelveFolder(prev, folder.id)),
                          }
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
                          <Text
                            style={[styles.folderName, { color: palette.ink }]}
                            numberOfLines={1}
                          >
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
              </Turning>
            );
          })}
          {/* Keyed by whose page it is: a reveal measures itself on mount
              and on scroll, and the turn moves it without either. */}
          <Turning key={owner} at={3 + meta.folders.length} x={turnX} o={turnO}>
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
          </Turning>
        </Animated.View>
      )}
    </TabPage>
  );
}

/** One block of the page as the face turns: it travels with the page, a
 *  little further the lower it stands, and fades a beat after the one above
 *  it — a cascade read off one driver, so it stays continuous when a turn is
 *  interrupted. */
function Turning({
  at,
  x,
  o,
  style,
  children,
}: {
  at: number;
  x: SharedValue<number>;
  o: SharedValue<number>;
  style?: object;
  children: ReactNode;
}) {
  const step = Math.min(at, 4);
  const lag = step * 0.08;
  const look = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (o.value - lag) / (1 - lag))),
    transform: [{ translateX: x.value * (1 + 0.15 * step) }],
  }));
  return <Animated.View style={[style, look]}>{children}</Animated.View>;
}

/** Shop's round arrow at the foot of a card: this goes somewhere. */
function Arrow() {
  const palette = usePalette();
  return (
    <View style={[styles.arrow, { backgroundColor: quiet(palette) }]}>
      <SymbolView name="arrow.right" size={15} weight="bold" tintColor={palette.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  whoseRow: { marginHorizontal: 16, marginTop: 2, marginBottom: 22 },
  continue: { marginHorizontal: 16, marginBottom: 16 },
  continueCard: { padding: 18, gap: 6 },
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
