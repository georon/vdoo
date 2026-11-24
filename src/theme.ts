// Light, dark, or whatever the system uses. The choice is a data-theme attribute on <html>, which the CSS honours over
// prefers-color-scheme, so it works in the browser edition too; the desktop shell also sets Electron's nativeTheme so
// the window frame and native controls match.
import { useEffect, useState } from "react";
import { readSetting, writeSetting } from "./preferences";

export type Theme = "system" | "light" | "dark";
export const THEMES: { theme: Theme; label: string }[] = [{ theme: "system", label: "System" }, { theme: "light", label: "Light" }, { theme: "dark", label: "Dark" }];
const KEY = "vdoo:theme";
const CHANGED = "vdoo:theme-changed";

export function savedTheme(): Theme {
  const t = readSetting(KEY);
  return t === "light" || t === "dark" ? t : "system";
}

/** Shows the page in `theme` and remembers it. Called at start-up too, before the first render, so the page doesn't flash. */
export function applyTheme(theme: Theme, remember = true) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme; else root.dataset.theme = theme;
  if (remember) writeSetting(KEY, theme);
  void window.vdooDesktop?.setTheme?.(theme).catch(() => {});
  window.dispatchEvent(new Event(CHANGED));
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = () => { const t = document.documentElement.dataset.theme; return t === "dark" || (t !== "light" && systemDark()); };

/** Whether the page is showing dark right now: the chosen theme, or the system's when the choice is System. */
export function useDarkMode() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setDark(isDark());
    query.addEventListener("change", change);
    window.addEventListener(CHANGED, change);
    return () => { query.removeEventListener("change", change); window.removeEventListener(CHANGED, change); };
  }, []);
  return dark;
}
