export const QA_BASE_URL = (process.env.QA_BASE_URL || 'https://gala.daviskids.org').replace(
  /\/+$/,
  ''
);
export const QA_TOKEN = process.env.QA_TOKEN || 'sgohonmgwicha15n';
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

