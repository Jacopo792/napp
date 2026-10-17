import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import type { HostedBody, HostedCommand } from "@/lib/hostedCommands";
import { loadVersionContent, loadVersions, nameVersion, type NoteVersion } from "@/lib/history";
import { formatDateTime } from "@/lib/format";
import { Group, Row } from "./Grouped";
import { NoteSheet } from "./NoteSheet";
import { attempt, Empty, Status } from "./SettingsControls";
import { useArchive, usePalette } from "./archive";
import { useTextPrompt } from "./TextPrompt";

type Execute = <T = unknown>(command: HostedCommand) => Promise<T>;

/* A native reading view of the version's structured text, never HTML. The
 * live editor remains mounted beneath the sheet until a restore is approved. */
function VersionText({ node }: { node: HostedBody["content"] }) {
  const palette = usePalette();
  if (node.type === "text")
    return (
      <Text
        style={{
          fontWeight: node.marks?.some((m) => m.type === "bold") ? "700" : "400",
          fontStyle: node.marks?.some((m) => m.type === "italic") ? "italic" : "normal",
        }}
      >
        {node.text}
      </Text>
    );
  if (node.type === "hardBreak") return <Text>{"\n"}</Text>;
  if (["privateImage", "privateFile", "drawing"].includes(node.type ?? ""))
    return (
      <Text style={{ color: palette.ink3 }}>
        {node.attrs?.label || node.attrs?.alt || "Attachment"}
        {"\n"}
      </Text>
    );
  return (
    <Text style={{ fontSize: node.type === "heading" ? 22 : 17 }}>
      {node.content?.map((child, i) => (
        <VersionText key={i} node={child} />
      ))}
      {["paragraph", "heading", "listItem", "taskItem", "tableRow"].includes(node.type ?? "")
        ? "\n"
        : ""}
    </Text>
  );
}

export function NoteHistory({
  noteId,
  canEdit,
  execute,
  onClose,
}: {
  noteId: string;
  canEdit: boolean;
  execute: Execute;
  onClose: () => void;
}) {
  const { session, snapshot } = useArchive();
  const palette = usePalette();
  const prompt = useTextPrompt();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<NoteVersion | null>(null);
  const [body, setBody] = useState<HostedBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void loadVersions(session, noteId).then(
      (list) => {
        if (live) setVersions(list);
      },
      (reason) => {
        if (live) setError(String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [session, noteId, revision]);
  useEffect(() => {
    setBody(null);
    if (!selected) return;
    let live = true;
    void loadVersionContent(selected.id).then(
      (value) => {
        if (live) setBody(value);
      },
      (reason) => {
        if (live) setError(String(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [selected]);
  const author = (id: string) =>
    id === session.userId
      ? "You"
      : snapshot?.members.find((m) => m.userId === id)?.nickname || "Member";
  return (
    <NoteSheet title="History" onClose={onClose}>
      {error ? <Status>{error}</Status> : null}
      {canEdit ? (
        <Group>
          <Row
            icon="plus"
            label="Name This Version"
            disabled={busy}
            onPress={() =>
              prompt(
                "Name This Version",
                undefined,
                (label) =>
                  void attempt(async () => {
                    if (!label.trim()) return;
                    setBusy(true);
                    try {
                      await nameVersion(
                        session,
                        noteId,
                        label,
                        await execute<HostedBody>({ type: "body" }),
                      );
                      setRevision((v) => v + 1);
                    } finally {
                      setBusy(false);
                    }
                  }),
              )
            }
          />
        </Group>
      ) : null}
      {selected ? (
        <>
          <Group>
            <Row
              icon="arrow.uturn.backward"
              label="All Versions"
              onPress={() => setSelected(null)}
            />
          </Group>
          <View style={{ marginHorizontal: 20, gap: 12 }}>
            <Text style={{ color: palette.ink3 }}>{formatDateTime(selected.createdAt)}</Text>
            <Text style={{ color: palette.ink, fontSize: 24, fontWeight: "700" }}>
              {body?.title || selected.title || "Untitled"}
            </Text>
            {body ? (
              <Text selectable style={{ color: palette.ink, lineHeight: 27 }}>
                <VersionText node={body.content} />
              </Text>
            ) : (
              <Text style={{ color: palette.ink3 }}>Loading…</Text>
            )}
          </View>
          {canEdit && body ? (
            <Group>
              <Row
                icon="arrow.uturn.backward"
                label={busy ? "Restoring…" : "Restore This Version"}
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Restore This Version?",
                    "Your current text will be kept as a version first.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Restore",
                        onPress: () =>
                          void attempt(async () => {
                            setBusy(true);
                            try {
                              await execute({ type: "restore", body });
                              onClose();
                            } finally {
                              setBusy(false);
                            }
                          }),
                      },
                    ],
                  )
                }
              />
            </Group>
          ) : null}
        </>
      ) : versions?.length === 0 ? (
        <Empty label="No versions yet" />
      ) : versions ? (
        <Group>
          {versions.map((version) => (
            <Row
              key={version.id}
              icon="clock"
              label={version.label || formatDateTime(version.createdAt)}
              detail={version.authorIds.map(author).join(", ")}
              onPress={() => setSelected(version)}
            />
          ))}
        </Group>
      ) : (
        <Empty label="Loading…" />
      )}
    </NoteSheet>
  );
}
