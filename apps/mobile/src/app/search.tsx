/* Search, of everything: what every search pill on the phone opens. It is the
 * web's ⌘K asked on a phone — the same ranking (`rankGroups` and `scoreFor`
 * in the core's spotlight.ts, so a typo is forgiven exactly as the web
 * forgives it, and "perche" finds "perché"), the same kinds of thing: notes by
 * title, the headings they are divided by, the line of text a word is in, the
 * words read out of their pictures and PDFs, folders, remarks, people, and the
 * places and acts of the app itself ("dark", "wallpaper", "invite"). At rest it
 * is the notes touched last. A note found here is a `NoteLink`: pressed it
 * opens, held it lifts. */
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import type { SFSymbol } from "expo-symbols";
import { loadArchiveComments } from "@/lib/comments";
import type { ArchiveComment } from "@/lib/commentThreads";
import { derivedOf, indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import { fold, formatStamp } from "@/lib/format";
import { loadMediaText } from "@/lib/mediaText";
import { readableMedia } from "@/lib/mediaTextShape";
import { headingsOf, rankGroups, snippetOf, type Findable, type Snippet } from "@/lib/spotlight";
import { useArchive, usePalette } from "../archive";
import { Card, SearchPill } from "../Chrome";
import { Press, quiet } from "../Grouped";
import { SymbolView } from "../icons";
import { NoteLink } from "../NoteLink";
import { useTextPrompt } from "../TextPrompt";
import { useCreateNote } from "../useCreateNote";

interface Result extends Findable {
  id: string;
  icon: SFSymbol;
  snippet?: Snippet;
  /** A note: opened by `NoteLink`, with its preview under a long press. */
  entry?: NoteEntry;
  comments?: boolean;
  open?: () => void;
}

export default function Search() {
  const { session, snapshot, metaOf, act } = useArchive();
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const router = useRouter();
  const prompt = useTextPrompt();
  const { create, importMarkdown } = useCreateNote(null, session.userId);
  const [query, setQuery] = useState("");
  const [remarks, setRemarks] = useState<ArchiveComment[]>([]);
  const [media, setMedia] = useState<Map<string, string>>(new Map());
  /* Both are one request each, asked once when the search opens. */
  useEffect(() => {
    let live = true;
    void loadArchiveComments(session).then(
      (list) => live && setRemarks(list),
      () => {},
    );
    void loadMediaText(session).then(
      (rows) => live && setMedia(rows),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [session]);

  const members = snapshot?.members ?? [];
  const nameOf = (userId: string) => {
    const member = members.find((one) => one.userId === userId);
    return member?.isSelf ? "You" : member?.nickname || "Member";
  };
  const entries = useMemo(
    () =>
      (snapshot?.entries ?? [])
        .filter(
          (entry) =>
            !indexOf(metaOf(entry.note.ownerId ?? session.userId)).byNote.get(entry.note.id)
              ?.trashedAt,
        )
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    [snapshot, metaOf, session.userId],
  );

  const go = (href: Href) => () => router.push(href);
  const section = (name: string) =>
    go({ pathname: "/settings/[section]", params: { section: name } });

  /* Everything that is found by its name, in the order the groups stand at
     rest and break ties with a query. */
  const named = useMemo((): Result[] => {
    const out: Result[] = [];
    for (const entry of entries) {
      const owner = entry.note.ownerId ?? session.userId;
      const folderId = indexOf(metaOf(owner)).byNote.get(entry.note.id)?.folderId;
      const folder = metaOf(owner).folders.find((one) => one.id === folderId)?.name;
      out.push({
        id: `note:${entry.note.id}`,
        group: "Notes",
        name: entry.note.title || "Untitled",
        hint: [folder, formatStamp(entry.note.updatedAt)].filter(Boolean).join(" · "),
        at: Date.parse(entry.note.updatedAt),
        icon: "note.text",
        entry,
      });
    }
    for (const member of members)
      for (const folder of metaOf(member.userId).folders)
        out.push({
          id: `folder:${folder.id}`,
          group: "Folders",
          name: folder.name,
          hint: member.isSelf ? "Your folder" : `${nameOf(member.userId)}’s folder`,
          searchOnly: true,
          icon: "folder",
          open: go({
            pathname: "/notes",
            params: { owner: member.userId, scope: folder.id, title: folder.name },
          }),
        });
    for (const remark of remarks) {
      if (remark.resolvedAt) continue;
      const entry = entries.find((one) => one.note.id === remark.noteId);
      if (!entry) continue;
      out.push({
        id: `remark:${remark.id}`,
        group: "Comments",
        name: remark.body.length > 90 ? `${remark.body.slice(0, 89)}…` : remark.body,
        hint: `${nameOf(remark.authorId)} · ${entry.note.title || "Untitled"}`,
        at: Date.parse(remark.createdAt),
        searchOnly: true,
        icon: "bubble.left.and.bubble.right",
        entry,
        comments: true,
      });
    }
    for (const member of members)
      out.push({
        id: `person:${member.userId}`,
        group: "People",
        name: member.isSelf ? `${member.nickname || "You"} (You)` : member.nickname || "Member",
        hint: member.isSelf ? session.email : "Member",
        keywords: "member partner people",
        searchOnly: true,
        icon: "person",
        open: section("members"),
      });
    const acts: [string, SFSymbol, string, () => void][] = [
      ["New Note", "square.and.pencil", "create write add compose", create],
      [
        "New Folder",
        "folder.badge.plus",
        "create add",
        () =>
          prompt("New Folder", undefined, (name) => {
            if (name.trim())
              act(session.userId, (prev) => ({
                ...prev,
                folders: [...prev.folders, { id: randomUUID(), name: name.trim(), parentId: null }],
              }));
          }),
      ],
      ["Import Markdown", "arrow.down.doc", "obsidian file md", importMarkdown],
      ["Settings", "gearshape", "preferences options", go("/settings")],
      ["Profile", "person.crop.circle", "name photo avatar nickname", section("profile")],
      [
        "Appearance",
        "paintpalette",
        "theme dark light automatic palette colour color",
        section("appearance"),
      ],
      ["Wallpaper", "photo", "background picture image", section("wallpaper")],
      ["Invite Someone", "person.badge.plus", "members share seats invitation", section("members")],
      ["Archives", "square.stack.3d.up", "switch space new archive", section("archives")],
      ["Writing", "pencil", "autocorrect autocorrection colour", section("writing")],
      [
        "Privacy",
        "hand.raised",
        "online presence hidden archived collaborators",
        section("security"),
      ],
      ["Comments", "bubble.left.and.bubble.right", "remarks conversations", go("/remarks")],
    ];
    for (const [name, icon, keywords, run] of acts)
      out.push({
        id: `act:${name}`,
        group: "Actions",
        name,
        keywords,
        searchOnly: true,
        icon,
        open: run,
      });
    return out;
    // `go`, `section` and the acts close over the router and the archive only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, members, remarks, metaOf, session]);

  /* What only a typed query finds — the web's `paletteSearch`: a heading,
     the line a word is in, the words in a note's pictures. `haystack` is
     already folded, so a note that does not hold the word costs one
     `includes`. */
  const found = (q: string): Result[] => {
    const out: Result[] = [];
    let lines = 0;
    for (const entry of entries) {
      const id = entry.note.id;
      const title = entry.note.title || "Untitled";
      const at = Date.parse(entry.note.updatedAt);
      const words = readableMedia(entry.note.content)
        .map((one) => media.get(one.id) || "")
        .join("\n");
      if (words && fold(words).includes(q))
        out.push({
          id: `media:${id}`,
          group: "Images and PDFs",
          name: title,
          snippet: snippetOf(words, q) ?? undefined,
          rank: 6,
          at,
          icon: "photo",
          entry,
        });
      if (!derivedOf(entry.note).haystack.includes(q)) continue;
      headingsOf(entry.note.content).forEach((heading, index) => {
        if (!fold(heading.text).includes(q)) return;
        out.push({
          id: `section:${id}:${index}`,
          group: "Sections",
          name: heading.text,
          hint: title,
          rank: 3,
          at,
          icon: "textformat",
          entry,
        });
      });
      // ponytail: the first thirty notes that hold the word, as the web; a ranked cap if an archive outgrows it.
      const snippet = lines < 30 ? snippetOf(entry.note.body, q) : null;
      if (snippet) {
        lines += 1;
        out.push({
          id: `text:${id}`,
          group: "Text",
          name: title,
          snippet,
          rank: 6,
          at,
          icon: "text.alignleft",
          entry,
        });
      }
    }
    return out;
  };

  const q = fold(query.trim());
  const groups = rankGroups(q ? [...named, ...found(q)] : named, q, 8);

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <View style={[styles.bar, { paddingTop: inset.top + 8 }]}>
        <SearchPill value={query} onChange={setQuery} autoFocus />
        <Press
          accessibilityRole="button"
          feedback="scale"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.cancel}
        >
          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "500" }}>Cancel</Text>
        </Press>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: inset.bottom + 40 }}
      >
        {groups.map((group) => (
          <Card key={group.group} style={styles.card}>
            <Text style={[styles.heading, { color: palette.ink3 }]}>
              {q ? group.group : group.group === "Notes" ? "Recent" : group.group}
            </Text>
            {group.items.map((item) => (
              <Hit key={item.id} item={item} />
            ))}
          </Card>
        ))}
        {q && !groups.length ? (
          <Text style={[styles.none, { color: palette.ink3 }]}>
            No results for “{query.trim()}”
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Hit({ item }: { item: Result }) {
  const palette = usePalette();
  const face = (
    <>
      <View style={[styles.disc, { backgroundColor: quiet(palette) }]}>
        <SymbolView name={item.icon} size={17} weight="medium" tintColor={palette.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.snippet ? (
          <Text style={{ color: palette.ink3, fontSize: 13 }} numberOfLines={2}>
            {item.snippet.before}
            <Text
              style={{
                color: palette.ink,
                fontWeight: "700",
                backgroundColor: palette.dark ? "#ffffff24" : "#0000001a",
              }}
            >
              {item.snippet.match}
            </Text>
            {item.snippet.after}
          </Text>
        ) : item.hint ? (
          <Text style={{ color: palette.ink3, fontSize: 13 }} numberOfLines={1}>
            {item.hint}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (item.entry)
    return (
      <NoteLink entry={item.entry} comments={item.comments} style={styles.row}>
        {face}
      </NoteLink>
    );
  return (
    <Press accessibilityRole="button" onPress={item.open} style={styles.row}>
      {face}
    </Press>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  cancel: { height: 40, justifyContent: "center", paddingHorizontal: 2 },
  card: { marginHorizontal: 16, marginBottom: 14, paddingBottom: 6 },
  heading: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 9 : 10,
  },
  disc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  none: { textAlign: "center", padding: 32, fontSize: 15 },
});
