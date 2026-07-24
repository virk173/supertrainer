// Theme model shared by the no-flash boot script and the React provider.
// The design tokens (packages/ui globals.css) key off a single `.dark` class on
// <html>; "system" follows the OS via prefers-color-scheme.

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "st.theme";
export const THEMES: readonly Theme[] = ["light", "dark", "system"] as const;

// Injected as an inline <script> at the top of <body> so the correct theme
// class is on <html> before first paint — no flash of the wrong theme on load.
// Kept tiny and dependency-free; failures (private-mode storage, etc.) fall
// back to the light default rather than throwing during document parse.
export const themeNoFlashScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
