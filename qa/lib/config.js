function isLocalhost(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export const QA_BASE_URL = (process.env.QA_BASE_URL || 'https://gala.daviskids.org').replace(
  /\/+$/,
  ''
);

const rawToken = process.env.QA_TOKEN || '';
if (!rawToken && !isLocalhost(QA_BASE_URL)) {
  throw new Error(
    'QA_TOKEN is required when QA_BASE_URL points at a non-localhost host. ' +
    'Copy .env.example, set QA_TOKEN to a dedicated test sponsor token, and re-run. ' +
    'See qa/README.md.'
  );
}
export const QA_TOKEN = rawToken;
export const QA_RIVAL_TOKEN = process.env.QA_RIVAL_TOKEN || '';
export const QA_FIXED_NOW = process.env.QA_FIXED_NOW || '2026-05-05T18:00:00-06:00';
export const SPONSOR_PATH = `/sponsor/${QA_TOKEN}`;

export function sponsorUrl(token = QA_TOKEN, suffix = '') {
  return `${QA_BASE_URL}/sponsor/${token}${suffix}`;
}

export function freezeClockScript(now = QA_FIXED_NOW) {
  return `
    (() => {
      const fixed = new Date(${JSON.stringify(now)}).valueOf();
      const NativeDate = Date;
      class MockDate extends NativeDate {
        constructor(...args) {
          if (args.length === 0) super(fixed);
          else super(...args);
        }
        static now() { return fixed; }
        static parse(value) { return NativeDate.parse(value); }
        static UTC(...args) { return NativeDate.UTC(...args); }
      }
      MockDate.prototype = NativeDate.prototype;
      window.Date = MockDate;
    })();
  `;
}

export async function preparePage(page) {
  await page.addInitScript({ content: freezeClockScript() });
}

