import { useEffect } from "react";
import { platform } from "@/platform";
import { supabase } from "@/lib/supabaseClient";
import { usageReporter } from "@/lib/usage";
import { webUsageDevice } from "@/lib/usageShape";

export function UsageTracking() {
  useEffect(() => {
    let stopped = false;
    let userId: string | undefined;
    let report = usageReporter(
      webUsageDevice(platform().kind, navigator.userAgent, navigator.maxTouchPoints),
      () => crypto.randomUUID(),
    );
    const activity = () => {
      if (userId && document.visibilityState === "visible" && document.hasFocus()) void report();
    };
    const adopt = (id: string | undefined) => {
      if (stopped || userId === id) return;
      userId = id;
      report = usageReporter(
        webUsageDevice(platform().kind, navigator.userAgent, navigator.maxTouchPoints),
        () => crypto.randomUUID(),
      );
      // Do not call the auth client from within its state-change callback.
      setTimeout(activity, 0);
    };
    let authChanged = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      adopt(session?.user.id);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!authChanged) adopt(data.session?.user.id);
      })
      .catch(() => {});
    const events = ["pointerdown", "keydown", "scroll", "focus", "visibilitychange"] as const;
    for (const event of events)
      window.addEventListener(event, activity, { passive: true, capture: true });
    return () => {
      stopped = true;
      userId = undefined;
      subscription.unsubscribe();
      for (const event of events) window.removeEventListener(event, activity, true);
    };
  }, []);
  return null;
}
