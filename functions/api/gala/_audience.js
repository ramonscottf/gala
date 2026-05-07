// Audience → recipients resolution.
//
// The marketing pipeline lets admins set an audience string per send like
// "Platinum Sponsors" or "Confirmed Buyers". When the admin hits Preview
// Send or Send Now, we need to translate that string into an actual SQL
// filter against the sponsors table.
//
// This module is the single source of truth for that mapping. Both the
// preview endpoint and the send endpoint call resolveAudience(audience, db)
// so they always agree on the recipient list.
//
// Tier values in production are messy — e.g. "Friends and Family",
// "IndividualSeats", "Individual Seats" all coexist. We normalize on the
// fly using lowercase substring matching.

// Canonical audience presets exposed in the admin UI dropdown.
// Keep in sync with the <select> options in public/admin/index.html.
export const AUDIENCE_PRESETS = [
  'Platinum Sponsors',
  'Gold Sponsors',
  'Silver Sponsors',
  'Bronze Sponsors',
  'Friends & Family',
  'Individual Seats',
  'All Sponsors (paid)',
  'All Sponsors + Friends & Family',
  'Confirmed Buyers',          // legacy — same as 'All Sponsors (paid)' for now
];

// Lowercase substring match against sponsorship_tier. Returns an array
// matching the variants we've seen in the wild.
function tierMatches(targetTier) {
  const t = targetTier.toLowerCase();
  if (t === 'platinum') return ['Platinum'];
  if (t === 'gold') return ['Gold'];
  if (t === 'silver') return ['Silver'];
  if (t === 'bronze') return ['Bronze'];
  if (t === 'friends' || t.startsWith('friends')) {
    return ['Friends and Family', 'Split Friends & Family'];
  }
  if (t === 'individual' || t.startsWith('individual')) {
    return ['Individual Seats', 'IndividualSeats'];
  }
  return [];
}

/**
 * Resolve an audience label into a list of recipient rows from the
 * sponsors table. Each row has at least { id, email, first_name, last_name,
 * company, sponsorship_tier }. Sponsors with archived_at set or no email
 * are excluded.
 *
 * Unknown audience labels return an empty list — preview will surface
 * "No recipients matched" rather than blasting the wrong people.
 */
export async function resolveAudience(audience, db) {
  const label = (audience || '').trim();
  if (!label) return { tiers: [], recipients: [] };

  const lc = label.toLowerCase();
  let tiers = [];

  // Sponsor tier presets
  if (lc.includes('platinum')) tiers = tierMatches('platinum');
  else if (lc.includes('gold')) tiers = tierMatches('gold');
  else if (lc.includes('silver')) tiers = tierMatches('silver');
  else if (lc.includes('bronze')) tiers = tierMatches('bronze');
  else if (lc.includes('friends')) tiers = tierMatches('friends');
  else if (lc.includes('individual')) tiers = tierMatches('individual');
  // Aggregate presets
  else if (lc.includes('all sponsors + friends') || lc.includes('all sponsors + ff')) {
    tiers = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Friends and Family', 'Split Friends & Family', 'Individual Seats', 'IndividualSeats'];
  }
  else if (lc.includes('all sponsors') || lc.includes('confirmed buyers') || lc.includes('paid sponsors')) {
    tiers = ['Platinum', 'Gold', 'Silver', 'Bronze'];
  }
  // Add more presets here as the pipeline grows.

  if (tiers.length === 0) {
    return { tiers: [], recipients: [], missingEmail: [] };
  }

  const placeholders = tiers.map(() => '?').join(',');

  // Recipients we WILL send to: tier-matching, not archived, has email
  const recipientsSql = `
    SELECT id, email, first_name, last_name, company, sponsorship_tier
    FROM sponsors
    WHERE sponsorship_tier IN (${placeholders})
      AND archived_at IS NULL
      AND email IS NOT NULL
      AND email != ''
    ORDER BY sponsorship_tier, company COLLATE NOCASE, last_name COLLATE NOCASE
  `;
  const recResult = await db.prepare(recipientsSql).bind(...tiers).all();

  // Missing-email rows: tier-matching, not archived, but no usable email.
  // These are the silent-skip cases — surface in the preview modal so admin
  // knows to fix sponsor records before sending.
  const missingSql = `
    SELECT id, first_name, last_name, company, sponsorship_tier
    FROM sponsors
    WHERE sponsorship_tier IN (${placeholders})
      AND archived_at IS NULL
      AND (email IS NULL OR email = '')
    ORDER BY sponsorship_tier, company COLLATE NOCASE, last_name COLLATE NOCASE
  `;
  const missResult = await db.prepare(missingSql).bind(...tiers).all();

  return {
    tiers,
    recipients: recResult.results || [],
    missingEmail: missResult.results || [],
  };
}

/** Best-effort display name for log rows. */
export function displayName(row) {
  if (row.company) return row.company;
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.join(' ').trim() || row.email || '(unknown)';
}
