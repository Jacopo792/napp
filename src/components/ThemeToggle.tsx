import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { type Theme, getTheme, setTheme } from "@/lib/theme";

const OPTIONS: [Theme, React.ReactNode, string][] = [
  ["light", <Sun size={12} strokeWidth={2} />, "Light"],
  ["device", <Monitor size={12} strokeWidth={2} />, "System"],
  ["dark", <Moon size={12} strokeWidth={2} />, "Dark"],
];

export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex rounded-lg border border-rule bg-paper p-0.5"
    >
      {OPTIONS.map(([t, icon, label]) => (
        <button
          key={t}
          title={label}
          aria-label={label}
          aria-pressed={theme === t}
          onClick={() => {
            setTheme(t);
            setLocal(t);
          }}
          className={`icon-button px-2 py-1.5 transition-colors ${
            theme === t ? "bg-accent text-on-accent" : "text-ink-3 hover:text-ink"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
