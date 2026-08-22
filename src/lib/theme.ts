export const THEME_STORAGE_KEY = "restropilot-theme";
export const THEMES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEMES)[number];

export function parseThemePreference(value: unknown): ThemePreference {
  return typeof value === "string" && THEMES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export const THEME_INITIALIZER = `(function(){try{var k='${THEME_STORAGE_KEY}',v=localStorage.getItem(k),p=v==='light'||v==='dark'||v==='system'?v:'system',d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),e=document.documentElement;e.classList.toggle('dark',d);e.classList.toggle('light',!d);e.dataset.theme=p;e.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('light')}})();`;
