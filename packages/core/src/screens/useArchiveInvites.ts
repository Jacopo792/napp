import { useCallback, useEffect, useState } from "react";
import { platform } from "@/platform";
import type { AppSession } from "@/lib/session";
import {
  createArchiveInvite,
  loadPendingInvites,
  revokeArchiveInvite,
  type PendingInvite,
} from "@/lib/supabase";

/** The archive's pending invitations. Only ever looked at where members are
 *  managed, so they are fetched while `open` and after anything that could
 *  change the count. */
export function useArchiveInvites(session: AppSession | null, open: boolean) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  const refreshInvites = useCallback(async () => {
    if (!session) return;
    try {
      setInvites(await loadPendingInvites(session));
    } catch {
      setInvites([]);
    }
  }, [session]);

  useEffect(() => {
    if (open) void refreshInvites();
  }, [open, refreshInvites]);

  const inviteLink = useCallback(
    async (email: string): Promise<string> => {
      if (!session) throw new Error("Sign in again first");
      const token = await createArchiveInvite(session, email);
      const link = new URL(platform().webOrigin());
      link.searchParams.set("invite", token);
      await refreshInvites();
      return link.toString();
    },
    [session, refreshInvites],
  );

  const withdrawInvite = useCallback(
    async (inviteId: string) => {
      await revokeArchiveInvite(inviteId);
      await refreshInvites();
    },
    [refreshInvites],
  );

  return { invites, inviteLink, withdrawInvite };
}
