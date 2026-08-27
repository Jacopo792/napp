import { useState, useEffect } from "react";

export type Theme = "light" | "dark" | "device";

const KEY = "napp:theme";
const EV = "napp:theme";

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? "device";
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  withCrossFade(() => applyTheme(t));
  window.dispatchEvent(new Event(EV));
}

/* Colour transitions cost something on every node, so they are only live
   while a theme switch is actually in flight. */
let fadeTimer: number | undefined;
function withCrossFade(fn: () => void): void {
  const root = document.documentElement;
  root.classList.add("theming");
  fn();
  clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => root.classList.remove("theming"), 220);
}

export function applyTheme(t: Theme): void {
  const dark =
    t === "dark" || (t === "device" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.colorMode = dark ? "dark" : "light";
}

export function initTheme(): void {
  applyTheme(getTheme());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "device") applyTheme("device");
    window.dispatchEvent(new Event(EV));
  });
}

export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains("dark"));
    window.addEventListener(EV, update);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
    return () => {
      window.removeEventListener(EV, update);
      window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", update);
    };
  }, []);
  return dark;
}
