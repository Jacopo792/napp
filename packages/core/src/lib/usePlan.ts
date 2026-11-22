import { useEffect, useState } from "react";
import { loadAccountPlan, loadArchivePlan, type AccountPlan, type ArchivePlan } from "@/lib/plan";

export function useAccountPlan(userId?: string) {
  const [state, setState] = useState<{ userId: string; plan: AccountPlan }>();
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const refresh = () =>
      void loadAccountPlan().then(
        (plan) => alive && setState({ userId, plan }),
        () => undefined,
      );
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [userId]);
  return state && state.userId === userId ? state.plan : undefined;
}

export function useArchivePlan(userId?: string, archiveId?: string) {
  const key = userId && archiveId && `${userId}/${archiveId}`;
  const [state, setState] = useState<{ key: string; plan: ArchivePlan | null }>();
  useEffect(() => {
    if (!archiveId || !key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const started = Date.now();
      let delay = 30_000;
      try {
        const plan = await loadArchivePlan(archiveId);
        if (!alive) return;
        setState({ key, plan });
        if (plan?.remaining_ms != null && plan.remaining_ms >= 0)
          delay = Math.min(delay, Math.max(100, started + plan.remaining_ms - Date.now()));
      } finally {
        if (alive) timer = setTimeout(() => void refresh().catch(() => undefined), delay);
      }
    };
    void refresh().catch(() => undefined);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [archiveId, key]);
  return state && state.key === key ? state.plan : undefined;
}
