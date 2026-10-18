import { useState } from "react";
import { useRouter } from "expo-router";
import { File } from "expo-file-system";
import { markdownToNote } from "@/features/editor/lib/exchange";
import { randomUUID } from "expo-crypto";
import { EMPTY_RICH_TEXT, RICH_TEXT_VERSION } from "@/features/editor/lib/content";
import { createNote } from "@/lib/supabase";
import { useArchive } from "./archive";
import { attempt } from "./SettingsControls";
import { useTextPrompt } from "./TextPrompt";

/** A new note in `owner`'s scope — anybody's, since a scope is a label and
 *  every member writes every one. */
export function useCreateNote(folderId: string | null = null, owner?: string) {
  const { session, refresh, snapshot } = useArchive();
  const router = useRouter();
  const prompt = useTextPrompt();
  const [creating, setCreating] = useState(false);
  return {
    creating,
    importMarkdown: () => {
      if (creating || snapshot?.members.find((member) => member.isSelf)?.role !== "editor") return;
      setCreating(true);
      void attempt(async () => {
        const picked = await File.pickFileAsync({
          mimeTypes: ["text/markdown", "text/plain", "text/x-markdown"],
        });
        if (picked.canceled) return;
        if (picked.result.size > 5 * 1024 * 1024)
          throw new Error("Choose a Markdown file smaller than 5 MB");
        const body = markdownToNote(picked.result.name, await picked.result.text());
        const id = randomUUID();
        const now = new Date().toISOString();
        const entry = await createNote(
          session,
          {
            id,
            title: body.title,
            body: "",
            content: body.content,
            contentVersion: RICH_TEXT_VERSION,
            legacyBody: null,
            photo: null,
            cover: null,
            ownerId: owner ?? session.userId,
            createdAt: now,
            updatedAt: now,
          },
          { id, folderId },
        );
        refresh();
        router.push({ pathname: "/note/[id]", params: { id: entry.note.id } });
      }).finally(() => setCreating(false));
    },
    create: () => {
      if (creating || snapshot?.members.find((member) => member.isSelf)?.role !== "editor") return;
      prompt("New Note", undefined, (title) => {
        if (!title.trim()) return;
        setCreating(true);
        void attempt(async () => {
          const id = randomUUID();
          const now = new Date().toISOString();
          const entry = await createNote(
            session,
            {
              id,
              title: title.trim(),
              body: "",
              content: structuredClone(EMPTY_RICH_TEXT),
              contentVersion: RICH_TEXT_VERSION,
              legacyBody: null,
              photo: null,
              cover: null,
              ownerId: owner ?? session.userId,
              createdAt: now,
              updatedAt: now,
            },
            { id, folderId },
          );
          refresh();
          router.push({ pathname: "/note/[id]", params: { id: entry.note.id } });
        }).finally(() => setCreating(false));
      });
    },
  };
}
