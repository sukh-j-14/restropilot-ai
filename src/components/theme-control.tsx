"use client";

import { useEffect, useRef, useState } from "react";
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY, THEMES, type ThemePreference } from "@/lib/theme";

const labels: Record<ThemePreference, string> = { light: "Light", dark: "Dark", system: "System" };

function applyTheme(preference: ThemePreference) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(preference, systemDark);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("light", resolved === "light");
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const preference = parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
    const update = window.setTimeout(() => setTheme(preference), 0);
    applyTheme(preference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => { if (parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) === "system") applyTheme("system"); };
    media.addEventListener("change", syncSystem);
    return () => { window.clearTimeout(update); media.removeEventListener("change", syncSystem); };
  }, []);

  useEffect(() => {
    function close(event: PointerEvent) { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);

  function select(value: ThemePreference) {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    setTheme(value);
    applyTheme(value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return <div ref={rootRef} className="relative">
    <button ref={triggerRef} type="button" aria-label={`Theme: ${labels[theme]}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`${compact ? "h-10 w-10 px-0" : "h-10 px-3"} inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900`}>
      <span aria-hidden>{theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}</span><span className={compact ? "sr-only" : "hidden sm:inline"}>{labels[theme]}</span>
    </button>
    {open && <div role="menu" aria-label="Choose color theme" className="absolute right-0 z-[70] mt-2 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      {THEMES.map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={theme === value} onClick={() => select(value)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><span>{labels[value]}</span>{theme === value && <span className="text-emerald-700" aria-hidden>✓</span>}</button>)}
    </div>}
  </div>;
}
