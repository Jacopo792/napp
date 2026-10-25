import { NotePicture } from "./NotePicture";
/* What a held row lifts: the note as it reads, drawn natively from the
 * projection the list already holds — the page Mail and Notes lift, without
 * starting a WebView, a Y.Doc and a socket for a glance. Pressing it opens the
 * real note. Pictures, files and drawings are named rather than fetched: a
 * glance is not worth a download. */
import { memo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { formatStamp } from "@/lib/format";
import type { Note } from "@/lib/types";

type JSONContent = Note["content"];
import { usePalette, type Palette } from "./archive";
import { Faces, type Face } from "./Avatar";
import { SymbolView } from "./icons";

/* A glance, not a reading: the first screenful is all the preview shows. */
const BLOCKS = 40;

function inline(node: JSONContent, palette: Palette, key: number): ReactNode {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text") return node.content?.map((child, i) => inline(child, palette, i));
  const marks = new Set(node.marks?.map((mark) => mark.type));
  const link = marks.has("link") || marks.has("noteLink");
  return (
    <Text
      key={key}
      style={{
        fontWeight: marks.has("bold") ? "700" : undefined,
        fontStyle: marks.has("italic") ? "italic" : undefined,
        textDecorationLine: marks.has("strike")
          ? "line-through"
          : marks.has("underline") || link
            ? "underline"
            : undefined,
        fontFamily: marks.has("code") ? "Menlo" : undefined,
        color: link ? palette.accent : undefined,
      }}
    >
      {node.text}
    </Text>
  );
}

function block(
  node: JSONContent,
  palette: Palette,
  out: ReactNode[],
  depth = 0,
  lead?: ReactNode,
): void {
  if (out.length >= BLOCKS) return;
  const key = out.length;
  const indent = { marginLeft: depth * 18 };
  const words = (style: object = {}) => (
    <Text style={[{ color: palette.ink, fontSize: 16, lineHeight: 23 }, style]}>
      {node.content?.map((child, i) => inline(child, palette, i))}
    </Text>
  );
  switch (node.type) {
    case "paragraph":
      if (!node.content?.length && !lead) return;
      out.push(
        <View key={key} style={[{ flexDirection: "row", gap: 8 }, indent]}>
          {lead}
          <View style={{ flex: 1 }}>{words()}</View>
        </View>,
      );
      return;
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      out.push(
        <View key={key} style={[{ marginTop: 6 }, indent]}>
          {words({
            fontSize: level === 1 ? 22 : level === 2 ? 19 : 17,
            lineHeight: level === 1 ? 28 : 24,
            fontWeight: "700",
          })}
        </View>,
      );
      return;
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      for (const [at, item] of (node.content ?? []).entries()) {
        if (out.length >= BLOCKS) break;
        const mark =
          node.type === "taskList" ? (
            <SymbolView
              name={item.attrs?.checked ? "checkmark.circle.fill" : "circle"}
              size={18}
              tintColor={item.attrs?.checked ? palette.accent : palette.ink4}
            />
          ) : (
            <Text style={{ color: palette.ink3, fontSize: 16, lineHeight: 23, minWidth: 14 }}>
              {node.type === "orderedList" ? `${Number(node.attrs?.start ?? 1) + at}.` : "•"}
            </Text>
          );
        for (const [i, child] of (item.content ?? []).entries()) {
          if (out.length >= BLOCKS) break;
          block(child, palette, out, depth + (i ? 1 : 0), i ? undefined : mark);
        }
      }
      return;
    case "blockquote":
      out.push(
        <View
          key={key}
          style={[
            { borderLeftWidth: 3, borderLeftColor: palette.rule, paddingLeft: 12, gap: 6 },
            indent,
          ]}
        >
          {node.content?.slice(0, BLOCKS - out.length).map((child, i) => (
            <Text key={i} style={{ color: palette.ink2, fontSize: 16, lineHeight: 23 }}>
              {child.content?.map((grand, j) => inline(grand, palette, j))}
            </Text>
          ))}
        </View>,
      );
      return;
    case "codeBlock":
      out.push(
        <View key={key} style={{ backgroundColor: palette.surface, borderRadius: 10, padding: 10 }}>
          {words({ fontFamily: "Menlo", fontSize: 13, lineHeight: 18 })}
        </View>,
      );
      return;
    case "horizontalRule":
      out.push(<View key={key} style={{ height: 1, backgroundColor: palette.rule }} />);
      return;
    case "privateImage":
    case "image":
    case "privateFile":
    case "drawing":
    case "table": {
      const icon =
        node.type === "table"
          ? "tablecells"
          : node.type === "drawing"
            ? "pencil"
            : node.type === "privateFile"
              ? "paperclip"
              : "photo";
      out.push(
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: palette.surface,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <SymbolView name={icon} size={16} tintColor={palette.ink3} />
          <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
            {String(
              node.attrs?.label ||
                node.attrs?.alt ||
                (node.type === "table"
                  ? "Table"
                  : node.type === "drawing"
                    ? "Drawing"
                    : node.type === "privateFile"
                      ? "Attachment"
                      : "Picture"),
            )}
          </Text>
        </View>,
      );
      return;
    }
    default:
      for (const child of node.content ?? []) {
        if (out.length >= BLOCKS) break;
        block(child, palette, out, depth);
      }
  }
}

export const NotePreview = memo(
  function NotePreview({ note, faces }: { note: Note; faces: Face[] }) {
    const palette = usePalette();
    const out: ReactNode[] = [];
    /* The body opens with the title as a heading more often than not; the page
     says it once, as the editor does. */
    const nodes = note.content.content ?? [];
    const first = nodes[0];
    const echo =
      first?.type === "heading" &&
      first.content
        ?.map((child) => child.text ?? "")
        .join("")
        .trim() === note.title.trim();
    for (let at = echo ? 1 : 0; at < nodes.length && out.length < BLOCKS; at++) {
      block(nodes[at], palette, out);
    }
    return (
      <View
        accessibilityLabel={`Preview of ${note.title || "Untitled"}`}
        style={{
          flex: 1,
          backgroundColor: palette.page,
          paddingHorizontal: 22,
          paddingTop: 22,
          gap: 12,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Messages' lifted thread opens on a small centred line saying when. */}
          <Text
            style={{
              flex: 1,
              color: palette.ink3,
              fontSize: 12,
              fontWeight: "500",
              textAlign: "center",
            }}
          >
            {formatStamp(note.updatedAt)}
          </Text>
          <Faces faces={faces} size={24} ring={palette.page} />
        </View>
        <NotePicture note={note} size={40} />
        <Text
          style={{ color: palette.ink, fontSize: 26, lineHeight: 31, fontWeight: "700" }}
          numberOfLines={3}
        >
          {note.title || "Untitled"}
        </Text>
        {out.length ? (
          out
        ) : (
          <Text style={{ color: palette.ink3, fontSize: 16 }}>No additional text</Text>
        )}
      </View>
    );
  },
  (before, after) =>
    before.note === after.note &&
    before.faces.length === after.faces.length &&
    before.faces.every((face, at) => {
      const next = after.faces[at];
      return (
        face.userId === next.userId &&
        face.name === next.name &&
        face.avatarObject === next.avatarObject &&
        face.online === next.online
      );
    }),
);
