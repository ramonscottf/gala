// useSheetFlag — Phase 1.9.1.
//
// Returns true when ?sheet=1 is present in the current URL search.
// Drives the staged rollout of the sheet-based seat-pick flow: when on,
// the Mobile/Desktop Place CTAs open SeatPickSheet inline instead of
// routing to the legacy MobileWizard. When off (default), nothing
// changes — old wizard is still the production code path.
//
// Plain-window read so it stays cheap inside render. The flag never
// flips mid-session; query params change only on full navigation, which
// remounts the portal tree.

export function useSheetFlag() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('sheet') === '1';
  } catch {
    return false;
  }
}
