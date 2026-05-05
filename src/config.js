// Runtime config. Capacitor-aware so the same bundle ships to web and any
// future iOS/Android wrap.
//
// On web, apiBase is empty → fetch('/api/...') hits the same origin
// (Cloudflare Pages Functions on gala.daviskids.org). In Capacitor the
// webview origin is capacitor://localhost (iOS) or https://localhost
// (Android), so we point at the deployed origin.
const isCapacitor =
  typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined';

export const config = {
  apiBase: isCapacitor ? 'https://gala.daviskids.org' : '',
  isCapacitor,
};
