import { useTextPrompt } from "../TextPrompt";
/* Folders, as Notes on the iPhone opens: whose notes, inside this archive, is
 * the You / Partner shelf of the web, and here it is the face at the top left:
 * pressing it switches to another member's notes. The group
 * holds everything of that member's: folders, the shelf and the waiting room. The toolbar makes a folder or a note on
 * the side that is showing.
 *
 * A folder row swipes as a note row does, with its own pair: right to remove
 * the folder (its notes stay, unfiled), left to file everything in it away. */
import { useCallback, useEffect, useRef, useState } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Alert, RefreshControl, ScrollView, Text } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { removeFolder, renameFolder, shelveFolder } from "@/lib/folderActs";
import { ALL, ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import type { Folder } from "@/lib/types";
import { useArchive, usePalette } from "../archive";
import { Avatar } from "../Avatar";
import { Backdrop } from "../Backdrop";
import { Group, Row, RowFace } from "../Grouped";
import { SwipeRow } from "../SwipeRow";
import { shelfGround, trashGround, travel } from "../theme";
import { useCreateNote } from "../useCreateNote";
import { IconButton } from "../IconButton";
import { WhoseSwitch } from "../WhoseSwitch";

/** Folders in the order the web draws them: each followed by its children. */
function nested(folders: Folder[]): { folder: Folder; depth: number }[] {
  const known = new Set(folders.map((folder) => folder.id));
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const folder of folders) {
      const under = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
      if (under !== parent) continue;
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function Folders() {
  const prompt = useTextPrompt();
  const { session, snapshot, error, metaOf, act, spaces, refresh, present, profile } = useArchive();
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const palette = usePalette();
  const router = useRouter();
  const editor = snapshot?.members.find((member) => member.isSelf)?.role === "editor";

  /* One row open at a time across the whole screen. */
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
  const [chosen, choose] = useState<string | null>(null);
  const shown = members.find((member) => member.userId === chosen) ?? members[0];
  const nameOf = (member: (typeof members)[number]) =>
    member.isSelf ? "You" : member.nickname || "Partner";
  /* The face at the top left is whose notes these are; pressing it turns to
     the next member's. Your profile is in Settings. */
  const whose = members.map((member) => ({
    face: {
      userId: member.userId,
      name: nameOf(member),
      avatarObject: member.avatarObject,
      online: !member.isSelf && present.has(member.userId),
    },
    email: member.isSelf ? session.email : undefined,
    title: member.isSelf ? "Your Notes" : `${nameOf(member)}’s Notes`,
  }));
  /* The group is not remounted when the face turns: its rows change in place
     and the whole of it eases in from the side the next face came from —
     forward from the right, back round to the first from the left. A remount
     stacked the old group under the new for a frame and jolted the page. */
  const shownAt = shown ? members.indexOf(shown) : 0;
  const lastAt = useRef(shownAt);
  const turn = useSharedValue(1);
  const from = useSharedValue(0);
  useEffect(() => {
    if (lastAt.current === shownAt) return;
    from.value = shownAt > lastAt.current ? 24 : -24;
    lastAt.current = shownAt;
    turn.value = 0;
    turn.value = withTiming(1, travel);
  }, [shownAt, turn, from]);
  const turning = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * turn.value,
    transform: [{ translateX: from.value * (1 - turn.value) }],
  }));
  /* What the toolbar makes lands on the side of the switch that is showing. */
  const owner = shown?.userId ?? session.userId;
  const { create, creating } = useCreateNote(null, owner);

  const newFolder = (owner: string, parentId: string | null = null) =>
    prompt(parentId ? "New Subfolder" : "New Folder", undefined, (name) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      act(owner, (prev) => ({
        ...prev,
        folders: [...prev.folders, { id: randomUUID(), name: trimmed, parentId }],
      }));
    });
  const remove = (owner: string, folder: Folder) =>
    Alert.alert(`Remove “${folder.name}”?`, "Its notes stay in All Notes.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => act(owner, (prev) => removeFolder(prev, folder.id)),
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: whose[shownAt]?.title ?? "Folders",
        }}
      />
      {shown ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.View hidesSharedBackground>
            <WhoseSwitch options={whose} selected={shown.userId} onChoose={choose} />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <IconButton icon="gearshape" label="Settings" onPress={() => router.push("/settings")} />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar>
        <Stack.Toolbar.View>
          <IconButton
            icon="folder.badge.plus"
            label="New folder"
            onPress={() => newFolder(owner)}
          />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.View>
          <IconButton
            icon="square.and.pencil"
            label="New note"
            onPress={create}
            disabled={creating}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor={palette.accent} />
        }
      >
        {error ? (
          <Text style={{ color: palette.danger, textAlign: "center", padding: 24 }}>{error}</Text>
        ) : null}
        <Group>
          <Link href={{ pathname: "/settings/[section]", params: { section: "archives" } }} asChild>
            <Row
              icon="square.stack.3d.up"
              fill={palette.accent}
              label={current?.name || "Archives"}
              detail={spaces.length > 1 ? spaces.length : undefined}
            />
          </Link>
          <Link href="/remarks" asChild>
            <Row icon="bubble.left.and.bubble.right" fill="#ff9f0a" label="Comments" last />
          </Link>
        </Group>
        {(shown ? [shown] : []).map((member) => {
          const meta = metaOf(member.userId);
          const theirs = (snapshot?.entries ?? []).filter(
            (entry) => entry.note.ownerId === member.userId,
          );
          const count = (scope: string) => entriesInScope(theirs, meta, scope).length;
          const folders = nested(meta.folders);
          const href = (scope: string, title: string) =>
            ({
              pathname: "/notes",
              params: { owner: member.userId, scope, title },
            }) as const;
          return (
            <Animated.View key="whose" style={turning}>
              <Group>
                <Link href={href(ALL, "All Notes")} asChild>
                  <Row
                    icon="note.text"
                    fill={palette.folder}
                    label="All Notes"
                    detail={count(ALL)}
                  />
                </Link>
                {folders.map(({ folder, depth }) => (
                  <SwipeRow
                    key={folder.id}
                    href={href(folder.id, folder.name)}
                    first={false}
                    last={false}
                    bare
                    onClaim={() => claim(folder.id)}
                    register={(close) => register(folder.id, close)}
                    rightward={
                      editor
                        ? {
                            label: "Remove",
                            icon: "trash.fill",
                            colour: trashGround,
                            stationary: true,
                            run: () => remove(member.userId, folder),
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
                            disabled: count(folder.id) === 0,
                            run: () => act(member.userId, (prev) => shelveFolder(prev, folder.id)),
                          }
                        : undefined
                    }
                    menu={
                      <Link.Menu>
                        <Link.MenuAction
                          title="Rename"
                          icon="pencil"
                          disabled={!editor}
                          onPress={() =>
                            prompt(
                              "Folder Name",
                              undefined,
                              (next) =>
                                act(member.userId, (prev) => renameFolder(prev, folder.id, next)),
                              "plain-text",
                              folder.name,
                            )
                          }
                        />
                        <Link.MenuAction
                          title="New Subfolder"
                          icon="folder.badge.plus"
                          disabled={!editor}
                          onPress={() => newFolder(member.userId, folder.id)}
                        />
                        <Link.MenuAction
                          title="Archive Notes"
                          icon="archivebox"
                          disabled={!editor || count(folder.id) === 0}
                          onPress={() =>
                            act(member.userId, (prev) => shelveFolder(prev, folder.id))
                          }
                        />
                        <Link.MenuAction
                          title="Remove Folder"
                          icon="trash"
                          destructive
                          disabled={!editor}
                          onPress={() => remove(member.userId, folder)}
                        />
                      </Link.Menu>
                    }
                  >
                    <RowFace
                      icon="folder.fill"
                      tint={palette.folder}
                      label={folder.name}
                      detail={count(folder.id)}
                      depth={depth}
                    />
                  </SwipeRow>
                ))}
                <Link href={href(ARCHIVE, "Archive")} asChild>
                  <Row
                    icon="archivebox.fill"
                    fill={shelfGround}
                    label="Archive"
                    detail={count(ARCHIVE)}
                  />
                </Link>
                <Link href={href(TRASH, "Recently Deleted")} asChild>
                  <Row
                    icon="trash.fill"
                    fill={trashGround}
                    label="Recently Deleted"
                    detail={count(TRASH)}
                    last
                  />
                </Link>
              </Group>
            </Animated.View>
          );
        })}
      </ScrollView>
      <Backdrop />
    </>
  );
}
