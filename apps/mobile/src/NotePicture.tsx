/* Note artwork uses the archive's private image bucket, separate from avatars. */
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { downloadImage } from "@/lib/supabase";
import type { Note } from "@/lib/types";
import { picture } from "./Avatar";
import { useArchive, usePalette } from "./archive";

export function useNoteImage(objectId: string | null | undefined) {
  const { session } = useArchive();
  const [stored, setStored] = useState<{ id: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!objectId) return;
    let live = true;
    void picture(objectId, () => downloadImage(session, objectId)).then((uri) => {
      if (live) setStored({ id: objectId, uri });
    });
    return () => {
      live = false;
    };
  }, [objectId, session]);
  return stored?.id === objectId ? stored?.uri : null;
}

export function NotePicture({ note, size = 28 }: { note: Pick<Note, "photo">; size?: number }) {
  const palette = usePalette();
  const uri = useNoteImage(note.photo?.objectId);
  if (!note.photo) return null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        overflow: "hidden",
        backgroundColor: palette.rule,
      }}
    >
      {uri ? (
        <Image source={{ uri }} accessible={false} style={{ width: size, height: size }} />
      ) : null}
    </View>
  );
}
