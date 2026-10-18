/* A note, wherever it is shown — a row of the list, the card to carry on
 * with, a pinned card, a title inside a folder's card, a conversation — is
 * the same thing under the finger: pressed, it opens; held, it lifts the note
 * as it reads (`NotePreview`, drawn natively from the projection) with the
 * note's acts under it. iOS lifts it itself (`Link.Preview`, `Link.Menu`);
 * Android has no such lift, so a long press offers the same preview and the
 * same acts in the app's own sheet (`useChoice`).
 *
 * The acts are the web's `menuNoteItems` — pin, the write lock, moving it —
 * then the scope's own two, which are also what the row's push uncovers. */
import type { ReactNode } from "react";
import { Alert, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, useLongPressGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Link } from "expo-router";
import { indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { ALL, ARCHIVE, TRASH } from "@/lib/scopes";
import { deleteNotes } from "@/lib/supabase";
import { useArchive } from "./archive";
import { Press } from "./Grouped";
import { NotePreview } from "./NotePreview";
import { attempt } from "./SettingsControls";
import type { Act } from "./SwipeRow";
import { useChoice } from "./TextPrompt";
import { shelfGround, trashGround } from "./theme";

export function useNoteActs(scope: string = ALL) {
  const { session, metaOf, act, refresh, facesOf } = useArchive();
  const choose = useChoice();
  const ownerOf = (entry: NoteEntry) => entry.note.ownerId ?? session.userId;
  const rowOf = (entry: NoteEntry) => indexOf(metaOf(ownerOf(entry))).byNote.get(entry.note.id);

  /** The scope's two acts: what the push uncovers, left and right. */
  const pair = (entry: NoteEntry): { left: Act; right: Act } => {
    const id = entry.note.id;
    const owner = ownerOf(entry);
    const row = rowOf(entry);
    const remove: Act = {
      label: "Delete",
      icon: "trash.fill",
      colour: trashGround,
      disabled: Boolean(row?.lockedBy && row.lockedBy !== session.userId),
      run: () => act(owner, (prev) => trashNote(prev, id)),
    };
    if (scope === TRASH)
      return {
        left: {
          ...remove,
          label: "Delete Forever",
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
        scope === ARCHIVE || row?.archivedAt
          ? {
              disabled: remove.disabled,
              label: "Put Back",
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

  const trash = scope === TRASH;

  /** The system's menu under a held note (iOS). */
  const menu = (entry: NoteEntry) => {
    const id = entry.note.id;
    const owner = ownerOf(entry);
    const row = rowOf(entry);
    const folders = metaOf(owner).folders;
    const { left, right } = pair(entry);
    return (
      <Link.Menu>
        {!trash ? (
          <Link.MenuAction
            title={row?.pinned ? "Unpin" : "Pin"}
            icon={row?.pinned ? "pin.slash" : "pin"}
            onPress={() => act(owner, (prev) => pinNote(prev, id))}
          />
        ) : null}
        {!trash ? (
          <Link.MenuAction
            title={row?.lockedBy === session.userId ? "Unlock" : "Lock"}
            icon={row?.lockedBy === session.userId ? "lock.open" : "lock"}
            disabled={Boolean(row?.lockedBy && row.lockedBy !== session.userId)}
            onPress={() => act(owner, (prev) => lockNote(prev, id, session.userId))}
          />
        ) : null}
        {!trash && folders.length ? (
          <Link.Menu title="Move" icon="folder">
            <Link.MenuAction
              title="No Folder"
              isOn={!row?.folderId}
              onPress={() => act(owner, (prev) => fileNote(prev, id, null))}
            />
            {folders.map((folder) => (
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
        {trash ? (
          <Link.Menu title="Delete Forever" icon="trash" destructive>
            <Link.MenuAction title="Delete Forever" destructive onPress={left.run} />
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

  /** The same, for a hand that held a note on Android. */
  const hold = (entry: NoteEntry) => {
    const id = entry.note.id;
    const owner = ownerOf(entry);
    const row = rowOf(entry);
    const folders = metaOf(owner).folders;
    const { left, right } = pair(entry);
    const foreign = Boolean(row?.lockedBy && row.lockedBy !== session.userId);
    choose(
      undefined,
      [
        ...(trash
          ? []
          : [
              {
                label: row?.pinned ? "Unpin" : "Pin",
                run: () => act(owner, (prev) => pinNote(prev, id)),
              },
              {
                label: row?.lockedBy === session.userId ? "Unlock" : "Lock",
                disabled: foreign,
                run: () => act(owner, (prev) => lockNote(prev, id, session.userId)),
              },
              {
                label: "Move…",
                disabled: !folders.length,
                run: () =>
                  choose("Move", [
                    {
                      label: "No Folder",
                      run: () => act(owner, (prev) => fileNote(prev, id, null)),
                    },
                    ...folders.map((folder) => ({
                      label: folder.name,
                      run: () => act(owner, (prev) => fileNote(prev, id, folder.id)),
                    })),
                  ]),
              },
            ]),
        { label: right.label, disabled: right.disabled, run: right.run },
        { label: left.label, disabled: left.disabled, destructive: true, run: left.run },
      ],
      <NotePreview note={entry.note} faces={facesOf(id)} />,
    );
  };

  return { pair, menu, hold };
}

/** A note that opens when pressed and lifts when held. */
export function NoteLink({
  entry,
  scope,
  zoom,
  feedback = "highlight",
  comments,
  style,
  children,
}: {
  /** Opens with its conversation. */
  comments?: boolean;
  entry: NoteEntry;
  scope?: string;
  /** Open with the system's zoom out of this view. */
  zoom?: boolean;
  feedback?: "highlight" | "scale";
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { facesOf } = useArchive();
  const { menu, hold } = useNoteActs(scope);
  /* A gesture-handler long press rather than the Pressable's own: inside a
     folder card the row is under the card's own push, and that gesture takes
     the touch from a plain responder before its long press can fire. */
  const held = useLongPressGesture({
    enabled: Platform.OS === "android",
    minDuration: 450,
    onActivate: () => {
      scheduleOnRN(hold, entry);
    },
  });
  const press = (
    <Press feedback={feedback} style={style}>
      {children}
    </Press>
  );
  const link = (
    <Link
      href={{
        pathname: "/note/[id]",
        params: comments ? { id: entry.note.id, comments: "1" } : { id: entry.note.id },
      }}
      asChild
    >
      {zoom ? (
        <Link.Trigger withAppleZoom>{press}</Link.Trigger>
      ) : (
        <Link.Trigger>{press}</Link.Trigger>
      )}
      <Link.Preview>
        <NotePreview note={entry.note} faces={facesOf(entry.note.id)} />
      </Link.Preview>
      {menu(entry)}
    </Link>
  );
  if (Platform.OS !== "android") return link;
  return (
    <GestureDetector gesture={held}>
      <View collapsable={false}>{link}</View>
    </GestureDetector>
  );
}
