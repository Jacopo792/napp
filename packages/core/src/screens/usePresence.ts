import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  announceNote,
  subscribeToPresence,
  unsubscribeFromPresence,
  type Presence,
} from "@/lib/presence";
import type { AppSession } from "@/lib/session";
import { announceTyping } from "@/lib/collab";

/** How long a pause has to be before the other person is told you stopped. */
const TYPING_IDLE_MS = 2500;

/** Who else is in the archive and which note each has open, and the "is
 *  writing" flag on the open note's document. Presence is opt-in: with
 *  `enabled` false nobody is announced and nobody is seen. */
export function usePresence(
  session: AppSession | null,
  enabled: boolean,
  selectedId: string | null,
  selectedIdRef: RefObject<string | null>,
  typingProvider: Parameters<typeof announceTyping>[0],
) {
  const [present, setPresent] = useState<Presence>(() => new Map());
  const onlineMemberIds = useMemo(() => new Set(present.keys()), [present]);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingOffRef = useRef<number | undefined>(undefined);
  const typingRef = useRef(false);

  useEffect(() => {
    if (!session || !enabled) {
      setPresent(new Map());
      return;
    }
    const channel = subscribeToPresence(session, setPresent, () => selectedIdRef.current);
    presenceChannelRef.current = channel;
    return () => {
      presenceChannelRef.current = null;
      void unsubscribeFromPresence(channel);
    };
  }, [session, enabled, selectedIdRef]);

  /* Which note this tab has open, for the other member's list. Only once the
     channel is up: the first announcement is made by the subscription itself. */
  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (channel && session) void announceNote(channel, session, selectedId).catch(() => {});
  }, [selectedId, session]);

  /* Writing is a fact about the note, so it is announced on the note's own
     document rather than on the archive's presence channel — the same place
     the face beside the title comes from, which is what stops the two
     disagreeing. Changing note lowers the flag first, so it can never be left
     raised on a page nobody is on. */
  useEffect(() => {
    window.clearTimeout(typingOffRef.current);
    typingRef.current = false;
    return () => {
      window.clearTimeout(typingOffRef.current);
      typingRef.current = false;
      announceTyping(typingProvider, false);
    };
  }, [typingProvider]);

  /* One announcement when the burst starts and one when it ends, rather than a
     packet per keystroke. TYPING_IDLE_MS is how long a pause has to be before
     the other person is told you stopped. */
  const markTyping = useCallback(() => {
    if (!typingProvider) return;
    window.clearTimeout(typingOffRef.current);
    if (!typingRef.current) {
      typingRef.current = true;
      announceTyping(typingProvider, true);
    }
    typingOffRef.current = window.setTimeout(() => {
      typingRef.current = false;
      announceTyping(typingProvider, false);
    }, TYPING_IDLE_MS);
  }, [typingProvider]);

  return { present, onlineMemberIds, markTyping };
}
