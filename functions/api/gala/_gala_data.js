const TIER_ALIASES = {
  Platinum: ['Platinum'],
  Gold: ['Gold'],
  Silver: ['Silver'],
  Bronze: ['Bronze', 'Bronze Sponsor'],
  'Cell Phone': ['Cell Phone'],
  'Friends and Family': ['Friends and Family', 'Friends & Family'],
  'Split Friends & Family': ['Split Friends & Family', 'Split Friends and Family'],
  'Individual Seats': ['Individual Seats', 'Individual Seating', 'Individual Tickets', 'Indivudial Tickets'],
  Trade: ['Trade'],
  Donation: ['Donation'],
};

let archiveSupportPromise = null;

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeSponsorTier(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const normalized = normalizeText(trimmed);
  for (const [canonical, aliases] of Object.entries(TIER_ALIASES)) {
    if (aliases.some((alias) => normalizeText(alias) === normalized)) {
      return canonical;
    }
  }

  return trimmed;
}

export function expandTierAliases(value) {
  if (!value || value === 'all') return [];
  const canonical = normalizeSponsorTier(value);
  return TIER_ALIASES[canonical] ? [...TIER_ALIASES[canonical]] : [String(value).trim()];
}

export function sponsorTierRank(value) {
  switch (normalizeSponsorTier(value)) {
    case 'Platinum': return 1;
    case 'Gold': return 2;
    case 'Silver': return 3;
    case 'Cell Phone': return 4;
    case 'Bronze': return 5;
    case 'Friends and Family': return 6;
    case 'Split Friends & Family': return 7;
    case 'Individual Seats': return 8;
    case 'Trade': return 9;
    case 'Donation': return 10;
    default: return 99;
  }
}

export function parseSeatCount(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isPaidStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  // 'unpaid' / 'not paid' both contain 'paid' — exclude first.
  if (normalized.includes('unpaid') || normalized.includes('not paid')) return false;
  return normalized.includes('paid') ||
    normalized.includes('complete') ||
    normalized.includes('confirmed');
}

export async function hasSponsorArchiveSupport(env) {
  if (!env?.GALA_DB) return false;
  if (!archiveSupportPromise) {
    archiveSupportPromise = env.GALA_DB.prepare('PRAGMA table_info(sponsors)')
      .all()
      .then(({ results }) => (results || []).some((col) => col.name === 'archived_at'))
      .catch(() => false);
  }
  return archiveSupportPromise;
}
