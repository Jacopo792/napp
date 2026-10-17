import { useTextPrompt } from "../TextPrompt";
import { useToolbarIcon } from "../icons";
/* Folders, as Notes on the iPhone opens: one group per member of the archive,
 * the way Notes has one per account — whose notes, inside this archive, which
 * is the You / Partner shelf of the web. Each holds everything, its folders,
 * the shelf and the waiting room. The toolbar makes a folder or a note. */
import { RefreshControl, ScrollView, Text } from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { ALL, ARCHIVE, entriesInScope, TRASH } from "@/lib/scopes";
import type { Folder } from "@/lib/types";
import { useArchive, usePalette } from "../archive";
import { Group, Row } from "../Grouped";
import { useCreateNote } from "../useCreateNote";

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
  const icon = useToolbarIcon();
  const { session, snapshot, error, metaOf, act, spaces, refresh, present } = useArchive();
  const { create, creating } = useCreateNote();
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const palette = usePalette();
  const router = useRouter();

  const members = [...(snapshot?.members ?? [])].sort((a, b) =>
    a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1,
  );

  const newFolder = () =>
    prompt("New Folder", undefined, (name) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      act(session.userId, (prev) => ({
        ...prev,
        folders: [...prev.folders, { id: randomUUID(), name: trimmed, parentId: null }],
      }));
    });

  return (
    <>
      <Stack.Screen options={{ title: "Folders" }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={icon("gearshape")}
          onPress={() => router.push("/settings")}
          accessibilityLabel="Settings"
        />
      </Stack.Toolbar>
      <Stack.Toolbar>
        <Stack.Toolbar.Button icon={icon("folder.badge.plus")} onPress={newFolder} />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={icon("square.and.pencil")}
          onPress={create}
          disabled={creating}
          accessibilityLabel="New Note"
        />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor={palette.accent} />
        }
      >
        <Group>
          <Link href={{ pathname: "/settings/[section]", params: { section: "archives" } }} asChild>
            <Row icon="square.stack.3d.up" label={current?.name || "Archives"} last />
          </Link>
        </Group>
        {error ? (
          <Text style={{ color: palette.danger, textAlign: "center", padding: 24 }}>{error}</Text>
        ) : null}
        <Group>
          <Link href="/remarks" asChild>
            <Row icon="bubble.left.and.bubble.right" label="Comments" last />
          </Link>
        </Group>
        {members.map((member) => {
          const meta = metaOf(member.userId);
          const theirs = (snapshot?.entries ?? []).filter(
            (entry) => entry.note.ownerId === member.userId,
          );
          const count = (scope: string) => entriesInScope(theirs, meta, scope).length;
          const folders = nested(meta.folders);
          const scopes = [
            { scope: ALL, label: "All Notes", icon: "folder" as const },
            ...folders.map(({ folder, depth }) => ({
              scope: folder.id,
              label: folder.name,
              icon: "folder" as const,
              depth,
            })),
            { scope: ARCHIVE, label: "Archive", icon: "archivebox" as const },
            { scope: TRASH, label: "Recently Deleted", icon: "trash" as const },
          ];
          return (
            <Group
              key={member.userId}
              title={
                member.isSelf
                  ? "Your Notes"
                  : `${member.nickname || "Partner"}’s Notes${present.has(member.userId) ? " · Online" : ""}`
              }
            >
              {scopes.map((item, index) => (
                <Link
                  key={item.scope}
                  href={{
                    pathname: "/notes",
                    params: { owner: member.userId, scope: item.scope, title: item.label },
                  }}
                  asChild
                >
                  <Row
                    icon={item.icon}
                    label={item.label}
                    detail={count(item.scope)}
                    tint={palette.folder}
                    depth={"depth" in item ? item.depth : 0}
                    last={index === scopes.length - 1}
                  />
                </Link>
              ))}
            </Group>
          );
        })}
      </ScrollView>
    </>
  );
}
