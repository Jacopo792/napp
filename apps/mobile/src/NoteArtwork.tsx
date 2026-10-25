import { useEffect, useRef, useState } from "react";
import { Image, Keyboard, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { uploadObjectBytes } from "@/lib/supabase";
import { clampCoverPosition, COVER_PRESETS } from "@/lib/pageProperties";
import type { NoteCover } from "@/lib/types";
import { useArchive, usePalette } from "./archive";
import { rememberPicture } from "./Avatar";
import { Press } from "./Grouped";
import { NoteSheet } from "./NoteSheet";
import { useNoteImage } from "./NotePicture";
import { pickPhoto, pickSquarePhoto } from "./ProfilePhoto";
import { attempt } from "./SettingsControls";
import { PillButton } from "./Chrome";

/** Every write patches only this decoration; the provider serializes it with
 * metadata writes and waits for it before leaving the account. */
export function useNoteArtwork(noteId: string, canEdit: boolean) {
  const { session, updateArtwork } = useArchive();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const perform = (action: () => Promise<void>) =>
    void attempt(async () => {
      if (!canEdit || working.current) return;
      working.current = true;
      setBusy(true);
      Keyboard.dismiss();
      try {
        await action();
      } finally {
        working.current = false;
        setBusy(false);
      }
    });
  const choose = (square: boolean) =>
    perform(async () => {
      const file = await (square ? pickSquarePhoto() : pickPhoto());
      if (!file) return;
      const objectId = randomUUID();
      await uploadObjectBytes(session, objectId, await file.arrayBuffer(), "image/jpeg");
      await updateArtwork(
        noteId,
        square
          ? { photo: { kind: "photo", objectId } }
          : { cover: { kind: "upload", objectId, position: 0.5 } },
      );
      rememberPicture(objectId, file.uri);
    });
  return {
    busy,
    choosePicture: () => choose(true),
    removePicture: () => perform(() => updateArtwork(noteId, { photo: null })),
    chooseCover: () => choose(false),
    setCover: (cover: NoteCover) => perform(() => updateArtwork(noteId, { cover })),
  };
}

export function NoteCoverSheet({
  noteId,
  canEdit,
  onClose,
}: {
  noteId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { snapshot } = useArchive();
  const palette = usePalette();
  const note = snapshot?.entries.find((item) => item.note.id === noteId)?.note;
  const cover = note?.cover ?? null;
  const { busy, chooseCover, setCover } = useNoteArtwork(noteId, canEdit);
  const [position, setPosition] = useState(cover?.position ?? 0.5);
  const draft = useRef(position);
  const [trackWidth, setTrackWidth] = useState(1);
  useEffect(() => {
    draft.current = cover?.position ?? 0.5;
    setPosition(draft.current);
  }, [cover]);
  const place = (x: number) => {
    draft.current = clampCoverPosition(x);
    setPosition(draft.current);
  };
  const commit = () => {
    if (cover?.kind === "upload" && draft.current !== cover.position)
      setCover({ ...cover, position: draft.current });
  };
  return (
    <NoteSheet title="Cover" busy={busy} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, gap: 24 }}>
        {cover ? <CoverPreview cover={cover} position={position} /> : null}
        {cover?.kind === "upload" ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: palette.ink3, fontSize: 13, fontWeight: "600" }}>Position</Text>
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Cover position"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={({ nativeEvent }) => {
                if (busy || !canEdit) return;
                place(position + (nativeEvent.actionName === "increment" ? 0.1 : -0.1));
                commit();
              }}
              onLayout={({ nativeEvent }) => setTrackWidth(nativeEvent.layout.width)}
              onStartShouldSetResponder={() => canEdit && !busy}
              onResponderGrant={({ nativeEvent }) => place(nativeEvent.locationX / trackWidth)}
              onResponderMove={({ nativeEvent }) => place(nativeEvent.locationX / trackWidth)}
              onResponderRelease={commit}
              onResponderTerminate={commit}
              style={{ height: 44, justifyContent: "center" }}
            >
              <View
                pointerEvents="none"
                style={{ height: 3, borderRadius: 2, backgroundColor: palette.rule }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: position * Math.max(0, trackWidth - 22),
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: palette.accent,
                }}
              />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {COVER_PRESETS.map((preset) => {
            const active = cover?.kind === "preset" && cover.id === preset.id;
            return (
              <Press
                key={preset.id}
                accessibilityRole="radio"
                accessibilityLabel={preset.name}
                accessibilityState={{ checked: active }}
                disabled={!canEdit || busy}
                onPress={() => setCover({ kind: "preset", id: preset.id, position: 0.5 })}
                style={{ width: "30.5%", gap: 6, paddingBottom: 8 }}
              >
                <View
                  style={{
                    height: 62,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    experimental_backgroundImage: preset.background,
                    borderWidth: 2,
                    borderColor: active ? palette.accent : "transparent",
                  }}
                />
                <Text style={{ color: palette.ink, fontSize: 13, textAlign: "center" }}>
                  {preset.name}
                </Text>
              </Press>
            );
          })}
        </View>
        <PillButton
          label={busy ? "Saving…" : "Choose Photo"}
          disabled={!canEdit || busy}
          onPress={chooseCover}
        />
        {cover ? (
          <Press
            disabled={!canEdit || busy}
            accessibilityRole="button"
            accessibilityLabel="Remove Cover"
            onPress={() => setCover(null)}
            style={{
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <Text style={{ color: palette.danger, fontSize: 16 }}>Remove Cover</Text>
          </Press>
        ) : null}
      </View>
    </NoteSheet>
  );
}

function CoverPreview({ cover, position }: { cover: NonNullable<NoteCover>; position: number }) {
  const palette = usePalette();
  const uri = useNoteImage(cover.kind === "upload" ? cover.objectId : null);
  const [width, setWidth] = useState(0);
  const [image, setImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!uri) return;
    let live = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (live) setImage({ uri, width: w, height: h });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [uri]);
  const size = image?.uri === uri ? image : null;
  const scale = size ? Math.max(width / size.width, 144 / size.height) : 1;
  const preset =
    cover.kind === "preset" ? COVER_PRESETS.find((item) => item.id === cover.id) : null;
  return (
    <View
      accessibilityLabel="Cover preview"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={{
        height: 144,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: palette.rule,
        experimental_backgroundImage: preset?.background,
      }}
    >
      {uri && size ? (
        <Image
          source={{ uri }}
          style={{
            position: "absolute",
            width: size.width * scale,
            height: size.height * scale,
            left: (width - size.width * scale) / 2,
            top: -(size.height * scale - 144) * position,
          }}
        />
      ) : null}
    </View>
  );
}
