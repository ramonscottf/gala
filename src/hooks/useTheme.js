// useTheme — V2 R7 (May 9 2026, Scott): light mode globally
// disabled. The hook now always returns dark. The matchMedia listener
// is left in source as a no-op so callers don't need to change their
// imports; revival is a one-line edit. The CSS variables in
// styles.css are also pinned to dark, and the meta theme-color is
// unconditional navy. Together these prevent every layer of the
// light/dark thrash we'd been seeing.
//
// Original behavior: detected prefers-color-scheme so JS-controlled
// surfaces (portal background gradient, FullScreenMessage states)
// could swap to the light token set. Restoration just means returning
// readIsLight() from the hook again.

export function useTheme() {
  return { isLight: false, isDark: true };
}
