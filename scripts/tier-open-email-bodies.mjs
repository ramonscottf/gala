// scripts/tier-open-email-bodies.mjs
//
// Canonical body HTML for the six tier-open emails. The format follows
// Kara's Platinum copy (the version Scott pasted in chat on May 14 2026) —
// she's an ex copy editor, so the wording is treated as the source of
// truth. All six tiers share the same structure:
//
//   1. Bold greeting + thank-you opener
//   2. Privacy + interface explanation paragraph
//   3. "Three main choices: session, movie, meal" paragraph
//   4. ⭐ The big gradient CTA button
//   5. Booker / contact note
//   6. Next-tier-opens callout (urgency)
//   7. Beta-tester ask for feedback
//   8. Sign-off
//
// Differences across tiers: greeting wording, next-tier date, and (in
// the lower tiers) a softer urgency. Closing language stays positive —
// nothing closes per se, your *exclusive* window does when the next tier
// opens. Per Scott (May 14 2026): "Their exclusive window closes. they
// never get shut off. we just let more people in."
//
// Button: bulletproof email-safe gradient using a fallback solid color
// plus the brand blue→red linear-gradient. Outlook gets the solid red;
// every modern client gets the gradient.
//
// Portal URL: gala.daviskids.org/sponsor/{TOKEN} — the canonical sponsor
// portal. (Several existing bodies — s5, s9 — pointed at the obsolete
// daviskids.org/gala-seats/{TOKEN} which 404s. Fixed in this pass.)

// ─── Gradient CTA button ───────────────────────────────────────────
// Bulletproof email-safe gradient. Outlook gets the solid red fallback,
// every modern client renders the blue→red brand gradient.
const GRADIENT_BUTTON = (label = 'Make my selections →') => `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" bgcolor="#c8102e" style="border-radius:10px;background:#c8102e;background-image:linear-gradient(90deg,#0066ff 0%,#c8102e 100%);">
      <a href="https://gala.daviskids.org/sponsor/{TOKEN}" target="_blank" style="display:inline-block;padding:18px 44px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:800;letter-spacing:0.6px;color:#ffffff !important;text-decoration:none;border-radius:10px;background:#c8102e;background-image:linear-gradient(90deg,#0066ff 0%,#c8102e 100%);">${label}</a>
    </td>
  </tr>
</table>`;

// ─── "Here's what to pick" — visual checklist of the 4 main choices ───
// Replaces Kara's original "three main choices" paragraph. Same content,
// scannable layout — each row is one action item with an icon and a
// one-line clarifier. The four items: movie, showtime, seats, meals.
// Built as a nested table so it renders the same in Outlook 2016 as it
// does in Apple Mail.
const CHOICES_CHECKLIST = `<p style="margin:18px 0 8px;font-size:15px;color:#0d1b3d;font-weight:700;">Here's what you'll pick:</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #d8dde8;border-radius:10px;margin:0 0 8px;">
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #eef0f5;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="36" valign="top" style="font-size:22px;line-height:24px;padding-right:10px;">🎬</td>
          <td valign="top" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:22px;">
            <strong style="color:#0d1b3d;">Movie</strong> — four choices, two showings
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #eef0f5;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="36" valign="top" style="font-size:22px;line-height:24px;padding-right:10px;">🕓</td>
          <td valign="top" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:22px;">
            <strong style="color:#0d1b3d;">Showtime</strong> — 4:30 PM or 7:15 PM
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #eef0f5;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="36" valign="top" style="font-size:22px;line-height:24px;padding-right:10px;">💺</td>
          <td valign="top" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:22px;">
            <strong style="color:#0d1b3d;">Seats</strong> — pick your exact seats in your auditorium
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="36" valign="top" style="font-size:22px;line-height:24px;padding-right:10px;">🍽️</td>
          <td valign="top" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:22px;">
            <strong style="color:#0d1b3d;">Meals</strong> — French dip sandwich, GF chicken salad, vegetarian, or kid's meal
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

// ─── "Bringing guests?" — delegation callout ──────────────────────
// Soft yellow accent strip (brand yellow #ffb400 on a warm tint). Explains
// the three ways to handle guests, in order of how often sponsors use them.
const GUESTS_BOX = `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#fffaf0;border:1px solid #f4d68a;border-left:4px solid #ffb400;border-radius:10px;margin:18px 0;">
  <tr><td style="padding:16px 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:1.2px;color:#8a5a00;text-transform:uppercase;">🎟️ Bringing guests?</p>
    <p style="margin:0 0 10px;font-size:14px;line-height:21px;color:#1a1a1a;">Three ways to do it — your call:</p>
    <ul style="margin:0;padding-left:20px;font-size:14px;line-height:22px;color:#1a1a1a;">
      <li><strong>Pick everything yourself</strong> — seats and meals for your whole group.</li>
      <li><strong>Invite each guest by name</strong> — they get their own link to pick their seat, meal, and movie. We'll send them their own ticket.</li>
      <li><strong>Mix &amp; match</strong> — choose some now and invite others to choose for themselves later.</li>
    </ul>
  </td></tr>
</table>`;

// ─── FAQ link ─────────────────────────────────────────────────────
const FAQ_LINE = `<p style="margin:14px 0 0;font-size:13px;color:#475569;text-align:center;">Want more details before you click? <a href="https://gala.daviskids.org/faq/" style="color:#0066ff;font-weight:600;text-decoration:underline;">Visit the FAQ →</a></p>`;

// ─── Booker / contact handoff ─────────────────────────────────────
// Tightened from Kara's original — moved Booker into one sentence so it
// doesn't compete with the checklist + guests box visually. Sherry +
// Scott contact info lives in the email footer (galaEmailHtml wrapper).
const BOOKER_P = `<p style="margin:18px 0 0;font-size:14px;color:#475569;">Questions while you're picking? <strong>Booker</strong>, your digital assistant, is in the bottom-right of every screen — or contact Sherry or Scott using the info below.</p>`;

const FEEDBACK_P_FIRST_GROUPS = `<p>We appreciate you being among the first to try this new platform and would love to hear your feedback so we can make adjustments that will improve the experience for all our guests. 🎬</p>`;

const FEEDBACK_P_LATER_GROUPS = `<p>We'd love to hear your feedback as you use the new platform — every note helps us improve the experience for our guests. 🎬</p>`;

const SIGN_OFF = `<p><strong>Can't wait to see you at the movies! 🎟️🍿</strong></p>
<p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>`;

// ────────────────────────────────────────────────────────────────────
//  PLATINUM — already sent May 11. Re-rendered here for consistency
//  in case we ever need to replay it.
// ────────────────────────────────────────────────────────────────────
export const PLATINUM_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">🎉 <strong>Hello, Platinum sponsors!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your sponsorship. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🔓 Ticket selection opens for the next group on May 14th</strong>, so act quickly to secure your preferred seats!</p>

${FEEDBACK_P_FIRST_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  GOLD — sending today, May 14
// ────────────────────────────────────────────────────────────────────
export const GOLD_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">🥇 <strong>Hello, Gold sponsors!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your sponsorship. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🔓 Ticket selection opens for the next group on May 18th</strong>, so act quickly to secure your preferred seats!</p>

${FEEDBACK_P_FIRST_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  SILVER — opens May 18
// ────────────────────────────────────────────────────────────────────
export const SILVER_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">🥈 <strong>Hello, Silver sponsors!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your sponsorship. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🔓 Ticket selection opens for the next group on May 20th</strong>, so act quickly to secure your preferred seats!</p>

${FEEDBACK_P_LATER_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  BRONZE — opens May 20
// ────────────────────────────────────────────────────────────────────
export const BRONZE_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">🥉 <strong>Hello, Bronze sponsors!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your sponsorship. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🔓 Ticket selection opens for Friends &amp; Family on May 25th</strong>, so act quickly to secure your preferred seats!</p>

${FEEDBACK_P_LATER_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  FRIENDS & FAMILY — opens May 25
// ────────────────────────────────────────────────────────────────────
export const FRIENDS_FAMILY_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">💛 <strong>Hello, Friends &amp; Family!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your reservation. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🔓 Ticket selection opens for individual ticket holders on May 28th</strong>, so act quickly to secure your preferred seats!</p>

${FEEDBACK_P_LATER_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  INDIVIDUAL SEATS — opens May 28 (last group, so no "next group")
// ────────────────────────────────────────────────────────────────────
export const INDIVIDUAL_SEATS_BODY = `<h3 style="margin:0 0 16px;font-size:18px;color:#0d1b3d;">🎟️ <strong>Hello, and welcome!</strong> We are so grateful for your participation in this year's gala and are excited to open ticket selection to you and your guests.</h3>

<p>The link below is private and tied to your reservation. The interface allows you the option to select seats and meals for yourself, select on behalf of your guests, or allow your guests to select for themselves.</p>

${CHOICES_CHECKLIST}

${GRADIENT_BUTTON('Make my selections →')}

${FAQ_LINE}

${GUESTS_BOX}

${BOOKER_P}

<p style="margin-top:18px;"><strong>🎬 Seat selection is now open to everyone</strong> — act quickly to secure your preferred seats. The gala is <strong>June 10th</strong>, and seats are first-come, first-served from here on out!</p>

${FEEDBACK_P_LATER_GROUPS}

${SIGN_OFF}`;

// ────────────────────────────────────────────────────────────────────
//  Manifest — what writes to marketing_sends.body for which send_id.
//  Subject lines stay as already-set in D1 (Sherry approved those May 7).
// ────────────────────────────────────────────────────────────────────
export const TIER_OPEN_BODIES = {
  s3:  { audience: 'Platinum Sponsors',      body: PLATINUM_BODY,         note: 'May 11 — already sent. Update for consistency / future replays.' },
  s5:  { audience: 'Gold Sponsors',          body: GOLD_BODY,             note: 'May 14 — sending today.' },
  s7:  { audience: 'Silver Sponsors',        body: SILVER_BODY,           note: 'May 18.' },
  s9:  { audience: 'Bronze Sponsors',        body: BRONZE_BODY,           note: 'May 20.' },
  s11: { audience: 'Friends & Family',       body: FRIENDS_FAMILY_BODY,   note: 'May 25.' },
  s12: { audience: 'Individual Seats',       body: INDIVIDUAL_SEATS_BODY, note: 'May 28. No further tier after this.' },
};
