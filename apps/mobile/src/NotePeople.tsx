/* Who is in a note, and what each of them has done to it — Comments' sibling,
 * in Comments' parts: a large title with a count, a round close, a segmented
 * choice, cards. People says who has the note open now (the archive presence
 * channel's `noteId`, as the faces in the bar do), where everybody else is, and
 * what each member wrote here, summed from the same `note_versions` rows the
 * web's person sheet reads. Activity is those rows as a day-by-day timeline,
 * Apple Notes' "Show All Activity": a bar in each writer's own colour, who,
 * what — edits with their words, a version named, a version restored — and
 * when. A row opens that version in History. */
import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loadVersions, type NoteVersion } from "@/lib/history";
import type { HostedCommand } from "@/lib/hostedCommands";
import { Avatar, hueOf, type Face } from "./Avatar";
import { SkeletonCard } from "./Chrome";
import { Card, Press, quiet } from "./Grouped";
import { NoteHistory } from "./NoteHistory";
import { Segments, Status } from "./SettingsControls";
import { useArchive, usePalette, type Palette } from "./archive";
import { SymbolView } from "./icons";

type Execute = <T = unknown>(command: HostedCommand) => Promise<T>;

/* `HostedNote` and the web panel both keep the present under this name before
   a restore ("Before restoring a version", "Before restoring 3 Oct, 14:02"). */
const isRestore = (version: NoteVersion) => Boolean(version.label?.startsWith("Before restoring"));

const DAY = 86_400_000;
function dayOf(iso: string): string {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const age = Math.round((start(new Date()) - start(date)) / DAY);
  if (age <= 0) return "Today";
  if (age === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const together = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "Somebody")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function NotePeople({
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
  const { session, snapshot, present, preferences } = useArchive();
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const [view, setView] = useState<"people" | "activity">("people");
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadVersions(session, noteId).then(
      (list) => live && setVersions(list),
      (reason) => live && setError(String(reason)),
    );
    return () => {
      live = false;
    };
  }, [session, noteId, revision]);

  const members = useMemo(
    () => [...(snapshot?.members ?? [])].sort((a, b) => Number(b.isSelf) - Number(a.isSelf)),
    [snapshot],
  );
  const nameOf = (id: string) =>
    id === session.userId
      ? "You"
      : members.find((m) => m.userId === id)?.nickname || "A former member";
  const faceOf = (id: string, online = false): Face => {
    const member = members.find((m) => m.userId === id);
    return {
      userId: id,
      name: member?.nickname || (id === session.userId ? session.email : "Member"),
      avatarObject: member?.avatarObject ?? null,
      online,
    };
  };
  const emailOf = (id: string) => (id === session.userId ? session.email : undefined);
  const colourOf = (id: string) => (id === session.userId ? palette.accent : hueOf(id));

  /* Where a member is, as presence already says it — nothing is stored. The
     channel is joined only while this reader broadcasts, so with presence off
     everybody reads as not online, and the page says why. */
  const placeOf = (id: string) => {
    const at = present.get(id);
    if (at === undefined) return "away" as const;
    if (at === noteId && preferences.collaborators) return "here" as const;
    return at && preferences.collaborators ? ("elsewhere" as const) : ("online" as const);
  };
  const here = members.filter((m) => !m.isSelf && placeOf(m.userId) === "here");

  /* Per person: what the versions they had a hand in added and took away, and
     the newest of them — the person sheet's arithmetic, on one note. */
  const written = (id: string) => {
    const mine = (versions ?? []).filter((v) => v.authorIds.includes(id));
    return {
      added: mine.reduce((sum, v) => sum + (v.wordsAdded ?? 0), 0),
      removed: mine.reduce((sum, v) => sum + (v.wordsRemoved ?? 0), 0),
      last: (versions ?? []).find((v) => v.authorIds.includes(id))?.createdAt ?? null,
    };
  };

  const days: { label: string; versions: NoteVersion[] }[] = [];
  for (const version of versions ?? []) {
    const label = dayOf(version.createdAt);
    const day = days.at(-1);
    if (day?.label === label) day.versions.push(version);
    else days.push({ label, versions: [version] });
  }

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      backdropColor={palette.page}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: palette.page }}>
        <View
          style={[styles.header, { paddingTop: Platform.OS === "android" ? inset.top + 14 : 20 }]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            People
          </Text>
          {members.length ? (
            <Text style={[styles.count, { color: palette.ink3 }]}>{members.length}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Press
            feedback="scale"
            accessibilityRole="button"
            accessibilityLabel="Done"
            hitSlop={8}
            onPress={onClose}
            style={[styles.round, { backgroundColor: quiet(palette) }]}
          >
            <SymbolView name="xmark" size={14} weight="bold" tintColor={palette.ink2} />
          </Press>
        </View>
        <View style={{ marginHorizontal: 4, marginBottom: 4 }}>
          <Segments
            options={[
              { id: "people" as const, label: "People" },
              {
                id: "activity" as const,
                label: versions?.length ? `Activity  ${versions.length}` : "Activity",
              },
            ]}
            value={view}
            onChange={(next) => {
              if (next === view) return;
              void Haptics.selectionAsync().catch(() => {});
              setView(next);
            }}
          />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: inset.bottom + 24, flexGrow: 1 }}
        >
          {error ? <Status>{error}</Status> : null}
          {view === "people" ? (
            <Animated.View key="people" entering={FadeIn.duration(220)}>
              <Card style={styles.card}>
                <Text style={[styles.heading, { color: palette.ink3 }]}>In this note now</Text>
                {here.length ? (
                  <View style={styles.hereRow}>
                    {here.map((member) => (
                      <View key={member.userId} style={styles.hereFace}>
                        <Avatar face={faceOf(member.userId, true)} size={52} ring={palette.paper} />
                        <Text numberOfLines={1} style={[styles.hereName, { color: palette.ink }]}>
                          {member.nickname || "Member"}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.quietLine, { color: palette.ink2 }]}>
                    Nobody else has this note open.
                  </Text>
                )}
              </Card>
              <Card style={styles.card}>
                <Text style={[styles.heading, { color: palette.ink3 }]}>Members</Text>
                <View style={{ paddingTop: 4, paddingBottom: 6 }}>
                  {members.map((member) => {
                    const place = member.isSelf ? "self" : placeOf(member.userId);
                    const { added, removed, last } = written(member.userId);
                    return (
                      <View key={member.userId} style={styles.person}>
                        <Avatar
                          face={faceOf(
                            member.userId,
                            place === "self" ? preferences.presence : place !== "away",
                          )}
                          email={emailOf(member.userId)}
                          size={40}
                          ring={palette.paper}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
                            {member.isSelf ? "You" : member.nickname || "Member"}
                          </Text>
                          <Text numberOfLines={1} style={[styles.meta, { color: palette.ink3 }]}>
                            {
                              {
                                self: "In this note now",
                                here: "In this note now",
                                elsewhere: "Online, in another note",
                                online: "Online",
                                away: "Not online",
                              }[place]
                            }
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          {versions === null ? null : last ? (
                            <>
                              {added || removed ? (
                                <Words added={added} removed={removed} palette={palette} />
                              ) : null}
                              <Text style={[styles.meta, { color: palette.ink3 }]}>
                                {dayOf(last)}
                              </Text>
                            </>
                          ) : (
                            <Text style={[styles.meta, { color: palette.ink4 }]}>No edits</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
              {!preferences.presence ? (
                <Text style={[styles.status, { color: palette.ink3 }]}>
                  Your presence is off in Privacy, so nobody&apos;s is shown.
                </Text>
              ) : null}
            </Animated.View>
          ) : !versions ? (
            <>
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </>
          ) : !versions.length ? (
            <Animated.View entering={FadeIn.duration(240)} style={styles.empty}>
              <View style={[styles.emptyDisc, { backgroundColor: quiet(palette) }]}>
                <SymbolView name="clock" size={30} tintColor={palette.ink3} />
              </View>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>No activity yet</Text>
            </Animated.View>
          ) : (
            <Animated.View key="activity" entering={FadeIn.duration(220)}>
              {days.map((day) => (
                <Card key={day.label} style={styles.card}>
                  <Text style={[styles.heading, { color: palette.ink3 }]}>{day.label}</Text>
                  <View style={{ paddingTop: 2, paddingBottom: 6 }}>
                    {day.versions.map((version) => {
                      const authors = version.authorIds;
                      const what = isRestore(version)
                        ? "restored a version"
                        : version.label
                          ? "named a version"
                          : version.wordsAdded === null &&
                              versions.length < 300 &&
                              version === versions.at(-1)
                            ? "started the note"
                            : "made edits";
                      return (
                        <Press
                          key={version.id}
                          accessibilityRole="button"
                          accessibilityHint="Opens this version in History"
                          onPress={() => setOpened(version.id)}
                          style={styles.event}
                        >
                          <View style={[styles.bar, { backgroundColor: palette.ink4 }]}>
                            {authors.map((id) => (
                              <View key={id} style={{ flex: 1, backgroundColor: colourOf(id) }} />
                            ))}
                          </View>
                          <View style={{ flexDirection: "row", width: 42 }}>
                            {authors.slice(0, 2).map((id, at) => (
                              <View key={id} style={{ marginLeft: at ? -12 : 0 }}>
                                <Avatar
                                  face={faceOf(id)}
                                  email={emailOf(id)}
                                  size={30}
                                  ring={palette.paper}
                                />
                              </View>
                            ))}
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text numberOfLines={2} style={[styles.line, { color: palette.ink2 }]}>
                              <Text style={{ color: palette.ink, fontWeight: "600" }}>
                                {together(version.authorIds.map(nameOf))}
                              </Text>{" "}
                              {what}
                            </Text>
                            {version.label && !isRestore(version) ? (
                              <Text
                                numberOfLines={1}
                                style={[styles.label, { color: palette.ink }]}
                              >
                                “{version.label}”
                              </Text>
                            ) : null}
                            <Text style={[styles.meta, { color: palette.ink3 }]}>
                              {timeOf(version.createdAt)}
                              {version.wordsAdded !== null ? "  ·  " : ""}
                              {version.wordsAdded !== null ? (
                                <Words
                                  added={version.wordsAdded}
                                  removed={version.wordsRemoved ?? 0}
                                  palette={palette}
                                />
                              ) : null}
                            </Text>
                          </View>
                          <SymbolView
                            name={isRestore(version) ? "arrow.uturn.backward" : "chevron.right"}
                            size={13}
                            weight="semibold"
                            tintColor={palette.ink4}
                          />
                        </Press>
                      );
                    })}
                  </View>
                </Card>
              ))}
            </Animated.View>
          )}
        </ScrollView>
      </View>
      {opened ? (
        <NoteHistory
          noteId={noteId}
          canEdit={canEdit}
          execute={execute}
          initial={opened}
          onClose={() => {
            setOpened(null);
            setRevision((at) => at + 1);
          }}
        />
      ) : null}
    </Modal>
  );
}

/** "+120 −30", the web panel's colours: added in green, removed in red. */
function Words({ added, removed, palette }: { added: number; removed: number; palette: Palette }) {
  return (
    <Text style={[styles.meta, { fontVariant: ["tabular-nums"] }]}>
      <Text style={{ color: "#34c759", fontWeight: "600" }}>+{added}</Text>
      <Text style={{ color: palette.ink4 }}> </Text>
      <Text style={{ color: palette.danger, fontWeight: "600" }}>−{removed}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.7 },
  count: { fontSize: 28, fontWeight: "600", letterSpacing: -0.7 },
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { marginHorizontal: 16, marginBottom: 14 },
  heading: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  hereRow: { flexDirection: "row", flexWrap: "wrap", gap: 18, padding: 18, paddingTop: 10 },
  hereFace: { alignItems: "center", gap: 6, width: 64 },
  hereName: { fontSize: 13, fontWeight: "600" },
  quietLine: { fontSize: 15, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  name: { fontSize: 16, fontWeight: "600", letterSpacing: -0.3 },
  meta: { fontSize: 13 },
  status: { fontSize: 13, marginHorizontal: 34, marginTop: -4 },
  event: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 10,
  },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 2, overflow: "hidden" },
  line: { fontSize: 15, letterSpacing: -0.2 },
  label: { fontSize: 15, fontStyle: "italic" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
});
