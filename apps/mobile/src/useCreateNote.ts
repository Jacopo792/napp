import { useState } from "react";
import { useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { EMPTY_RICH_TEXT, RICH_TEXT_VERSION } from "@/features/editor/lib/content";
import { createNote } from "@/lib/supabase";
import { useArchive } from "./archive";
import { attempt } from "./SettingsControls";

export function useCreateNote(folderId: string | null = null) {
  const { session, refresh } = useArchive();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  return {
    creating,
    create: () => {
      if (creating) return;
      setCreating(true);
      void attempt(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const entry = await createNote(
          session,
          {
            id,
            title: "",
            body: "",
            content: structuredClone(EMPTY_RICH_TEXT),
            contentVersion: RICH_TEXT_VERSION,
            legacyBody: null,
            photo: null,
            cover: null,
            ownerId: session.userId,
            createdAt: now,
            updatedAt: now,
          },
          { id, folderId },
        );
        refresh();
        router.push({ pathname: "/note/[id]", params: { id: entry.note.id } });
      }).finally(() => setCreating(false));
    },
  };
}
