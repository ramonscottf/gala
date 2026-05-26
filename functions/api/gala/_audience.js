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
  // Internal-only test/sandbox audience used for dry-running a full
  // production send before blasting to real corporate sponsors. Resolves
  // to the three internal sandbox sponsorships only:
  //   - Miggin Inc.     (Sherry Miggin)
  //   - 2N Family       (Kara Toone)
  //   - Wicko Waypoint  (Scott Foster)
  // The blast path (queue + consumer + per-recipient {TOKEN} substitution)
  // is identical to a real send — just scoped to people who know what to
  // do when it lands wrong. Always flip s3.audience back to "Platinum
  // Sponsors" after the dry-run before firing the real Platinum blast.
  'Platinum Internal',
  'Gold Sponsors',
  'Silver Sponsors',
  'Bronze Sponsors',
  'Friends & Family',
  'Individual Seats',
  'All Sponsors (paid)',
  'All Sponsors + Friends & Family',
  'Confirmed Buyers',          // Everyone who has bought a tier and is attending — all paid + F&F + Individual Seats
  // Dynamic: every eligible-to-select tier (all but Individual Seats) whose
  // placed seats < seats_purchased. Re-resolves at send time, so anyone who
  // finishes before the next send drops off. Carries seats_remaining for the
  // {SEATS_LEFT} personalization token.
  'Incomplete Seat Selections',
];

// Companies that count as the "Platinum Internal" sandbox audience.
// These are the three internal-Foster-orbit sponsorships used for dry
// runs. NOT exposed to the public — admin-only convenience filter.
const PLATINUM_INTERNAL_COMPANIES = ['Miggin Inc.', '2N Family', 'Wicko Waypoint'];

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
  // Company-based audience (sandbox/internal dry-run). Returns the
  // recipient list directly via the same SELECT shape as the tier path,
  // skipping the tier-IN logic below. MUST be checked BEFORE the
  // 'platinum' substring branch, because 'platinum internal' would
  // otherwise resolve as 'platinum' and pull all 13 corporate sponsors.
  if (lc.includes('platinum internal')) {
    const placeholders = PLATINUM_INTERNAL_COMPANIES.map(() => '?').join(',');
    const internalSql = `
      SELECT id, email, first_name, last_name, company, sponsorship_tier, rsvp_token
      FROM sponsors
      WHERE company IN (${placeholders})
        AND archived_at IS NULL
        AND email IS NOT NULL
        AND email != ''
      ORDER BY company COLLATE NOCASE
    `;
    const internalResult = await db.prepare(internalSql)
      .bind(...PLATINUM_INTERNAL_COMPANIES).all();
    return {
      tiers: ['Platinum (Internal sandbox)'],
      recipients: internalResult.results || [],
      missingEmail: [],
    };
  }

  // Eligible-to-select sponsors who haven't finished placing their seats.
  // "Eligible" = every paid/F&F tier EXCEPT Individual Seats (an individual
  // holds a single ticket — nothing to keep selecting/delegating). "Not
  // finished" = placed seat_assignments < seats_purchased. Dynamic at send
  // time so anyone who completes before the next send drops off. Returns
  // seats_remaining per recipient for the {SEATS_LEFT} token. Checked before
  // the tier substring branches so it doesn't fall through to a plain tier.
  if (lc.includes('incomplete seat')) {
    const eligTiers = ['Platinum', 'Gold', 'Silver', 'Bronze',
                       'Friends and Family', 'Split Friends & Family'];
    const ph = eligTiers.map(() => '?').join(',');
    const placedExpr = '(SELECT COUNT(*) FROM seat_assignments sa WHERE sa.sponsor_id = s.id)';
    const recSql = `
      SELECT s.id, s.email, s.first_name, s.last_name, s.company, s.sponsorship_tier, s.rsvp_token,
             s.seats_purchased,
             ${placedExpr} AS placed,
             (s.seats_purchased - ${placedExpr}) AS seats_remaining
      FROM sponsors s
      WHERE s.sponsorship_tier IN (${ph})
        AND s.archived_at IS NULL
        AND s.email IS NOT NULL AND s.email != ''
        AND s.rsvp_token IS NOT NULL AND s.rsvp_token != ''
        AND s.seats_purchased > ${placedExpr}
      ORDER BY seats_remaining DESC, s.company COLLATE NOCASE
    `;
    const rec = await db.prepare(recSql).bind(...eligTiers).all();
    const missSql = `
      SELECT s.id, s.first_name, s.last_name, s.company, s.sponsorship_tier
      FROM sponsors s
      WHERE s.sponsorship_tier IN (${ph})
        AND s.archived_at IS NULL
        AND (s.email IS NULL OR s.email = '' OR s.rsvp_token IS NULL OR s.rsvp_token = '')
        AND s.seats_purchased > ${placedExpr}
      ORDER BY s.company COLLATE NOCASE
    `;
    const miss = await db.prepare(missSql).bind(...eligTiers).all();
    return {
      tiers: ['Eligible · seats not finished'],
      recipients: rec.results || [],
      missingEmail: miss.results || [],
    };
  }

  // Sponsor tier presets
  if (lc.includes('platinum')) tiers = tierMatches('platinum');
  else if (lc.includes('gold')) tiers = tierMatches('gold');
  else if (lc.includes('silver')) tiers = tierMatches('silver');
  else if (lc.includes('bronze')) tiers = tierMatches('bronze');
  else if (lc.includes('friends')) tiers = tierMatches('friends');
  else if (lc.includes('individual')) tiers = tierMatches('individual');
  // Aggregate presets
  // 'Confirmed Buyers' = anyone who's bought a tier and is attending the gala.
  // Reads as 'everyone confirmed coming' to a human; that's how it should resolve.
  // Donations / Silent Auction live in the donors table and are excluded by definition.
  else if (lc.includes('confirmed buyers') ||
           lc.includes('all sponsors + friends') ||
           lc.includes('all sponsors + ff')) {
    tiers = ['Platinum', 'Gold', 'Silver', 'Bronze',
             'Friends and Family', 'Split Friends & Family',
             'Individual Seats', 'IndividualSeats'];
  }
  // 'All Sponsors' / 'Paid Sponsors' = the top four corporate tiers only.
  // Use this when you specifically want Platinum/Gold/Silver/Bronze (e.g.
  // logo-on-screen, tier-only thank-yous, sponsor-recognition messaging).
  else if (lc.includes('all sponsors') || lc.includes('paid sponsors')) {
    tiers = ['Platinum', 'Gold', 'Silver', 'Bronze'];
  }
  // Add more presets here as the pipeline grows.

  if (tiers.length === 0) {
    return { tiers: [], recipients: [], missingEmail: [] };
  }

  const placeholders = tiers.map(() => '?').join(',');

  // Recipients we WILL send to: tier-matching, not archived, has email
  const recipientsSql = `
    SELECT id, email, first_name, last_name, company, sponsorship_tier, rsvp_token
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
