import { useState } from "react";
import { CalendarDays, X } from "@/components/icons";

export function TrialNotice({ days, onOpen }: { days: number; onOpen: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="trial-notice" role="status">
      <button type="button" className="press" onClick={onOpen}>
        <CalendarDays size={15} />
        {days === 1 ? "Plus trial ends in 1 day" : "Plus trial ends in 7 days"}
      </button>
      <button
        type="button"
        className="press"
        aria-label="Dismiss trial reminder"
        onClick={() => setDismissed(true)}
      >
        <X size={15} />
      </button>
    </div>
  );
}
