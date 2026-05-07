// /api/gala/marketing-test
// Admin-only endpoint to fire test sends of any marketing pipeline touch.
// POST { sendId: 's1a' | 'sms5' | ..., recipients: ['scott' | 'sherry' | 'both'] }
//
// Copy registry below is the canonical source for all gala 2026 outbound
// messaging. Edit a `body`/`subject`/`sms` here and the test send reflects it
// immediately. The matching marketing tab data in gala-dashboard/index.html
// shares ids with this registry — keep them in sync.

import { verifyGalaAuth, jsonError, jsonOk } from './_auth.js';
import { sendSMS, sendEmail, galaEmailHtml } from './_notify.js';

// ── Recipient resolution ───────────────────────────────────────────────────
const SCOTT_EMAIL = 'sfoster@dsdmail.net';
const SHERRY_EMAIL = 'smiggin@dsdmail.net';

function resolveRecipients(env, who) {
  // who: 'scott' | 'sherry' | 'both'
  const list = [];
  if (who === 'scott' || who === 'both') {
    list.push({ email: SCOTT_EMAIL, phone: env.GALA_TEST_PHONE_SCOTT, label: 'Scott' });
  }
  if (who === 'sherry' || who === 'both') {
    list.push({ email: SHERRY_EMAIL, phone: env.GALA_TEST_PHONE_SHERRY, label: 'Sherry' });
  }
  return list;
}

// ── Reusable copy blocks (HTML, slot into email body) ──────────────────────
const PORTAL_LINK = 'https://gala.daviskids.org/sponsor/{TOKEN}';
const AUCTION_LINK = 'https://secure.qgiv.com/event/lcadefsa2/';
const DRAWING_LINK = 'https://daviskids.org/49ers';

const BTN = (href, label, color = '#CB262C') =>
  `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:13px 30px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">${label}</a></p>`;

const DRAWING_CARD_LONG = `
  <div style="background:linear-gradient(135deg,#fef7f7,#fff);border:2px solid #CB262C;border-radius:12px;padding:20px 22px;margin:24px 0;">
    <p style="margin:0 0 6px;color:#CB262C;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">🏈 49ers Opportunity Drawing</p>
    <p style="margin:0 0 8px;color:#0b1b3c;font-size:18px;font-weight:700;">$100 donation supports school lunch — and enters you to win.</p>
    <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Six San Francisco 49ers home game tickets (lower bowl, 19th row) plus a $2,000 travel card. Each $100 donation to Davis school lunch is one entry. Limited to the first 200 donations. Drawing held at the gala on June 10.</p>
    <p style="margin:0;color:#475569;font-size:13px;"><a href="${DRAWING_LINK}" style="color:#CB262C;font-weight:600;text-decoration:underline;">See full rules and how to enter →</a></p>
  </div>`;

const DRAWING_CARD_MEDIUM = `
  <div style="background:#fef7f7;border-left:3px solid #CB262C;border-radius:8px;padding:14px 18px;margin:20px 0;">
    <p style="margin:0 0 4px;color:#CB262C;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">🏈 49ers Drawing — supports school lunch</p>
    <p style="margin:0 0 6px;color:#0b1b3c;font-size:14px;line-height:1.5;"><strong>$100 donation = 1 entry. Limited to the first 200 donations.</strong> 6 49ers tickets + $2,000 travel card. Drawing held at the gala on June 10.</p>
    <p style="margin:0;font-size:13px;"><a href="${DRAWING_LINK}" style="color:#CB262C;font-weight:600;text-decoration:underline;">Rules and how to enter →</a></p>
  </div>`;

const SHOWING_BLOCK = `
  <div style="margin:18px 0;">
    <p style="margin:0 0 6px;color:#0b1b3c;font-weight:700;font-size:15px;">🎬 Four films, two showings — your call</p>
    <p style="margin:0 0 12px;color:#1e293b;font-size:14px;line-height:1.6;">The Mandalorian &amp; Grogu (IMAX) · Breadwinner · Paddington 2 · How to Train Your Dragon</p>
    <p style="margin:0 0 4px;color:#CB262C;font-weight:700;font-size:14px;">🔴 Early showing</p>
    <p style="margin:0 0 14px;color:#475569;font-size:13px;">Social hour 4:00 PM · Dinner 4:30 PM · Movie 5:00 PM</p>
    <p style="margin:0 0 4px;color:#0b1b3c;font-weight:700;font-size:14px;">🔵 Late showing</p>
    <p style="margin:0;color:#475569;font-size:13px;">Social hour 6:00 PM · Dinner 7:15 PM · Movie 7:45 PM</p>
  </div>`;

const DINNER_BLOCK = `
  <div style="margin:14px 0;">
    <p style="margin:0 0 6px;color:#0b1b3c;font-weight:700;font-size:15px;">🍱 Dinner — packed lunchbox style. Old school. Elevated.</p>
    <p style="margin:0 0 14px;color:#475569;font-size:13px;line-height:1.5;">Plated to your seat in a brown-paper-bag-meets-bistro-tray reveal. Choose one per ticket:</p>
    <ul style="color:#1e293b;font-size:14px;line-height:1.85;padding-left:20px;margin:0;">
      <li><strong>The Cafeteria Champ</strong> — hot brisket French dip with au jus and crispy fries</li>
      <li><strong>The Brown Bag Classic</strong> — cold turkey sandwich, chips, apple slices, the cookie</li>
      <li><strong>The Garden Tray</strong> — veggie salad with seasonal toppings (vegetarian)</li>
      <li><strong>The Lunch Lady Special</strong> — kids meal: chicken nuggets, fruit, juice box</li>
      <li><strong>The Field Trip Fix</strong> — gluten-free option (chef's plate, GF-certified)</li>
    </ul>
  </div>`;

// ── Send registry (24 sends keyed by id, matches dashboard PIPELINE) ──────
const SENDS = {
  // ─── PHASE 1: THE RESET ───
  s1a: {
    type: 'email',
    subject: "We're grateful for your sponsorship — here's what to expect",
    body: `
      <p>We're excited you're coming to the gala on <strong>June 10 at Megaplex Centerville</strong> — and deeply grateful for your company's sponsorship and support. This event only happens because of partners like you.</p>
      <p>We're writing to give you the first look at something we built for you this year:</p>
      <p><strong>A new seat selection platform.</strong> No more "where am I sitting?" guessing games. When your sponsor window opens (we'll tell you exactly when), you'll get a private link to select your exact seats, choose your dinner, and finalize everything in under two minutes.</p>
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">What's coming up</h3>
      <ul style="color:#1e293b;font-size:14px;line-height:1.8;padding-left:20px;margin:0 0 20px;">
        <li><strong>May 4</strong> — Platinum sponsors select first</li>
        <li><strong>May 11</strong> — Gold sponsor window opens</li>
        <li><strong>May 14</strong> — Silver</li>
        <li><strong>May 17</strong> — Bronze</li>
        <li><strong>May 28</strong> — Full event details, auction preview, food and showtime selections</li>
      </ul>
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">And one more thing.</h3>
      
  <div style="background:linear-gradient(135deg,#fef7f7,#fff);border:2px solid #CB262C;border-radius:12px;padding:20px 22px;margin:24px 0;">
    <p style="margin:0 0 6px;color:#CB262C;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">🏈 49ers Opportunity Drawing</p>
    <p style="margin:0 0 8px;color:#0b1b3c;font-size:18px;font-weight:700;">$100 donation supports school lunch for students in need— and enters you to win.</p>
    <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Six San Francisco 49ers home game tickets (lower bowl, 19th row) plus a $2,000 travel card. Each $100 donation goes directly to providing lunch for Davis students who need it — and gives you one entry to win. Limited to the first 200 donations. Drawing held at the gala on June 10.</p>
    <p style="margin:0;color:#475569;font-size:13px;"><a href="https://daviskids.org/49ers" style="color:#CB262C;font-weight:600;text-decoration:underline;">See full rules and how to enter →</a></p>
  </div>
      <p style="color:#475569;font-size:13px;">Save the date. We'll be in touch.</p>
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and the entire DEF team</p>
    
`,
  },
  s1b: {
    type: 'email',
    subject: 'Gala 2026 is back — and the seats are filling up',
    body: `
      <p style="font-size:18px;font-weight:700;color:#0b1b3c;margin:0 0 16px;">Wednesday, June 10, 2026 • Megaplex Centerville</p>
      <p>Here's what's new this year:</p>
      <p>🎟 <strong>A real seat selection platform.</strong> Select your exact seats, your dinner, and your showtime — all from your phone. No spreadsheets, no email chains.</p>
      <p>🎬 <strong>Four films across two showings.</strong> The Mandalorian &amp; Grogu in IMAX, Breadwinner, Paddington 2, How to Train Your Dragon. Choose what you want to see.</p>
      <p>🍱 <strong>Dinner — packed lunchbox style.</strong> Old-school school lunch, elevated. Five options including kids and gluten-free.</p>
      ${DRAWING_CARD_MEDIUM}
      ${BTN('https://daviskids.org/events-gala', 'Select your seats →')}
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and the entire DEF team</p>
    `,
  },

  // ─── PHASE 2: TIERED OPEN ───
  s3: {
    type: 'email',
    subject: 'Platinum sponsors: your seat selection is now open',
    body: `
      <p>As one of our <strong>Platinum sponsors</strong>, you get the first selection of the house — every seat, every showing, every auditorium is open to you right now.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p>Your link is private and tied to your sponsorship. <strong>Choose by Friday, May 8</strong> to lock in your top choice.</p>
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">Two showings, four films, your call.</h3>
      ${SHOWING_BLOCK}
      <p style="color:#475569;font-size:13px;margin-top:20px;"><strong>A note on the 49ers Drawing:</strong> A $100 donation to school lunch enters you to win 6 49ers tickets + a $2,000 travel card. <a href="${DRAWING_LINK}" style="color:#CB262C;font-weight:600;">See full rules and how to enter →</a></p>
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  sms1: { type: 'sms', body: 'Platinum window is OPEN. Your private link to select seats: ' + PORTAL_LINK + ' — Sherry & Kara, DEF Gala' },
  s4: {
    type: 'email',
    subject: 'Last day for Platinum seat selection',
    body: `
      <p>Quick heads up — <strong>Platinum seat selection opens up to Gold tomorrow morning.</strong> Your top choices are still available, but they may not be after that.</p>
      ${BTN(PORTAL_LINK, 'Select your seats now →')}
      <p>It's quick — your dinner choice, your row, your showtime, all in one place.</p>
      <p>If you've already finalized, you can ignore this. If you'd like help, just reply to this email.</p>
      <p style="color:#475569;font-size:13px;">— Kara</p>
    `,
  },
  s5: {
    type: 'email',
    subject: 'Gold sponsors: select your seats now',
    body: `
      <p>Your private seat selection is live. You'll see what's left after Platinum, and there's still plenty of premium real estate in every auditorium.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p><strong>Your window closes Tuesday, May 13.</strong></p>
      ${SHOWING_BLOCK}
      <p style="color:#475569;font-size:14px;">Mandalorian &amp; Grogu is in our biggest auditorium (IMAX, 308 seats) — those go quickest.</p>
      ${DRAWING_CARD_MEDIUM}
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  sms2: { type: 'sms', body: 'Gold window is open. Select your seats: ' + PORTAL_LINK + ' — closes Tuesday. DEF Gala' },
  s6: {
    type: 'email',
    subject: 'Gold seats — last call before Silver opens',
    body: `
      <p>Silver opens tomorrow morning. If you'd still like to lock in your Gold seats, here's your link.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p style="color:#475569;font-size:13px;">— Kara</p>
    `,
  },
  s7: {
    type: 'email',
    subject: 'Silver sponsors: your seat selection is live',
    body: `
      <p>It is time to select your seats. Choose your row, your dinner, your showtime.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p><strong>Your window closes Friday, May 16.</strong></p>
      <p>🔴 Early showing • 🔵 Late showing — both have The Mandalorian &amp; Grogu, Breadwinner, Paddington 2, and How to Train Your Dragon. Choose what you want to see.</p>
      ${DRAWING_CARD_MEDIUM}
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  sms3: { type: 'sms', body: 'Silver window opens now. Your link: ' + PORTAL_LINK + ' — closes Fri. DEF Gala' },
  s8: {
    type: 'email',
    subject: 'Silver seats close tonight',
    body: `
      <p>If you're a Silver sponsor and haven't selected yet, this is the last call before the next tier opens.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p style="color:#475569;font-size:13px;">— Kara</p>
    `,
  },
  s9: {
    type: 'email',
    subject: 'Bronze sponsors: select your seats',
    body: `
      <p>You're up.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p><strong>Closes Tuesday, May 19.</strong></p>
      <p>🔴 Early showing • 🔵 Late showing</p>
      ${DRAWING_CARD_MEDIUM}
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  sms4: { type: 'sms', body: 'Bronze window is OPEN. Last sponsor tier before general. Select: ' + PORTAL_LINK + ' — closes Tue. DEF Gala' },
  s10: {
    type: 'email',
    subject: 'Bronze closes tonight — general opens tomorrow',
    body: `
      <p>General access opens tomorrow morning. Get your seats locked in first.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <p style="color:#475569;font-size:13px;">— Kara</p>
    `,
  },

  // ─── PHASE 3: GENERAL PUSH ───
  s11: {
    type: 'email',
    subject: 'General seat selection is open. The 49ers drawing is coming.',
    body: `
      <p>If you bought individual seats, your portal is now live. Select your row, your dinner, your showtime — all in one place.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">And the big one is almost here.</h3>
      ${DRAWING_CARD_LONG}
      <p style="color:#475569;font-size:13px;">Drawing flow goes live with the main event email on <strong>May 28</strong>. Be ready.</p>
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">A few things to know</h3>
      <p>🎬 <strong>Four films, two showings.</strong> The Mandalorian &amp; Grogu (IMAX) is going fastest.<br/>
      🍱 <strong>Dinner is packed-lunch style</strong> — five options, kids and gluten-free included.<br/>
      🅿 <strong>Parking and check-in details</strong> come in the May 28 email.</p>
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  sms5: { type: 'sms', body: 'General seat selection is OPEN. Select yours: ' + PORTAL_LINK + ' — and get ready for the 49ers drawing May 28. DEF Gala' },
  s12: {
    type: 'email',
    subject: 'Gala 2026 — everything you need for June 10',
    body: `
      <p style="font-size:17px;color:#0b1b3c;font-weight:700;margin:0 0 8px;">Two weeks. Here's everything.</p>
      <p>Wednesday, <strong>June 10</strong>. Megaplex Centerville.</p>
      <p>This email has everything you need: the auction preview, the 49ers drawing (it's now live), final seat selection, and the day-of flow.</p>

      <div style="background:#aa0000;border-radius:12px;padding:24px;margin:24px 0;color:#fff;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#ffd76a;">🏈 49ers Opportunity Drawing is live</p>
        <p style="margin:0 0 10px;font-size:22px;font-weight:800;line-height:1.2;color:#fff;">$100 donation = 1 entry</p>
        <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#fff;">6 49ers tickets + $2,000 travel card</p>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#fff;opacity:0.95;">Every donation supports school lunch for Davis kids. Limited to the first 200 donations.</p>
        <p style="margin:0;"><a href="${DRAWING_LINK}" style="display:inline-block;background:#fff;color:#aa0000;padding:12px 26px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">See rules and enter →</a></p>
      </div>

      <h3 style="color:#0b1b3c;font-size:17px;margin:28px 0 10px;">🎟 Final seat selection</h3>
      <p>Haven't selected yet? Now's the time. <strong>Selection closes May 31.</strong></p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      ${SHOWING_BLOCK}
      ${DINNER_BLOCK}

      <h3 style="color:#0b1b3c;font-size:17px;margin:28px 0 10px;">🔨 Auction preview</h3>
      <p>Bidding opens <strong>June 8 at 6:00 AM</strong> and closes the evening of June 10. The full catalog is locked the week before — no surprise drops on gala night, just bid early and bid often.</p>
      <p style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>What's on the block:</strong></p>
      <ul style="color:#1e293b;font-size:14px;line-height:1.7;padding-left:20px;margin:0 0 18px;">
        <li>✈️ <strong>Disneyland Resort 5-day vacation</strong> — moderate hotel, 3-day Park Hopper, 2 adults + 2 kids</li>
        <li>🌴 <strong>San Diego 5-day getaway</strong> — round-trip flights for two (up to $300/person), hotel, attractions</li>
        <li>🏀 <strong>Utah Jazz tickets + Toyota Club access</strong> — Section 18, Row 5</li>
        <li>🍕 <strong>Gozney Dome wood-fired pizza oven</strong> — backyard chef's dream, ~$1,400 retail</li>
        <li>🐔 <strong>Chick-fil-A for an entire year</strong> — 52 gift cards, one per week</li>
        <li>🎨 <strong>Signed limited-edition art collection</strong> — James Christensen, Bev Doolittle, Greg Olsen, Carl Brenders, Larry Fanning, and more (most with conservation framing)</li>
        <li>🎢 <strong>Lagoon ticket bundles</strong> — multiple packages with single-day passes, picnic gear, and themed plushies</li>
        <li>🏈 <strong>49ers experience packages</strong> <em>(separate from the drawing)</em></li>
        <li>🎬 <strong>Plus 180+ more</strong> — kayaks, Cricut crafting bundle, Roomba, Nespresso, JBL headphones, Lego sets, restaurant gift cards, and a whole lot more</li>
      </ul>

      <div style="background:#f3f5f9;border-left:3px solid #1f4484;border-radius:8px;padding:14px 18px;margin:20px 0;">
        <p style="margin:0 0 6px;color:#1f4484;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">📱 Bidding has gotten so much better</p>
        <p style="margin:0 0 8px;color:#0b1b3c;font-size:14px;line-height:1.55;">We're on <strong>Qgiv (Givi)</strong> this year — the bidding experience is a huge upgrade. Bid from your phone, get outbid alerts, set max bids, watch your favorites — all from anywhere. Register your account now and you'll be ready the moment bidding opens.</p>
        <p style="margin:0;"><a href="${AUCTION_LINK}" style="color:#1f4484;font-weight:700;text-decoration:underline;font-size:13px;">Register on Givi now →</a></p>
      </div>

      ${BTN(AUCTION_LINK, 'Register to bid on Givi →', '#1f4484')}
      <p style="color:#475569;font-size:13px;">Register today, browse the catalog when it opens, and bid June 8–10 from anywhere.</p>

      <h3 style="color:#0b1b3c;font-size:17px;margin:28px 0 10px;">📍 Day-of basics</h3>
      <p style="color:#1e293b;font-size:14px;line-height:1.8;">401 N 75 W, Centerville, UT 84014<br/>
      Dress: casual — wear what makes you feel great</p>
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and everyone at DEF</p>
    `,
  },
  sms6: { type: 'sms', body: 'Gala main email is in your inbox. 49ers drawing is LIVE — $100 donation supports school lunch + enters you to win. Seats close May 31. ' + PORTAL_LINK },
  s13: {
    type: 'email',
    subject: 'Tomorrow is the seat selection deadline',
    body: `
      <p>Seat selection closes tomorrow at 11:59 PM. After that, we'll assign remaining seats and you'll find out where you're sitting on the day of.</p>
      <p>If you'd rather select yourself — and most of you would — now's the time.</p>
      ${BTN(PORTAL_LINK, 'Select your seats →')}
      ${DRAWING_CARD_MEDIUM}
      <p style="color:#475569;font-size:13px;">— Kara</p>
    `,
  },
  sms7: { type: 'sms', body: 'Tomorrow night seat selection closes. After that we assign. Select now: ' + PORTAL_LINK + ' — DEF Gala' },
  sms8: { type: 'sms', body: '6 hours left to select your gala seats. After midnight we assign. ' + PORTAL_LINK },

  // ─── PHASE 4: AUCTION ANTICIPATION ───
  s14: {
    type: 'email',
    subject: 'The auction preview is live on Givi. Bidding opens June 8.',
    body: `
      <p>Bidding doesn't open until <strong>June 8 at 6:00 AM</strong>, but the full catalog is locked, loaded, and visible right now on <strong>Givi (Qgiv)</strong>.</p>
      ${BTN(AUCTION_LINK, 'Browse the catalog on Givi →', '#1f4484')}
      <p>This year's bidding experience is a huge upgrade — bid from your phone, set max bids, get outbid alerts, watch your favorites. Register your account today and you'll be ready the moment bidding opens.</p>
      <p style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Headliners to watch:</strong></p>
      <ul style="color:#1e293b;font-size:14px;line-height:1.7;padding-left:20px;margin:0 0 18px;">
        <li>✈️ Disneyland 5-day vacation (3-day Park Hopper, family of 4)</li>
        <li>🌴 San Diego 5-day getaway with round-trip flights for two</li>
        <li>🏀 Utah Jazz tickets + Toyota Club access</li>
        <li>🐔 Chick-fil-A for a year (52 gift cards)</li>
        <li>🍕 Gozney Dome wood-fired pizza oven</li>
        <li>🎨 Signed limited-edition art (Christensen, Doolittle, Olsen, Brenders)</li>
        <li>🎢 Multiple Lagoon ticket bundles</li>
        <li>🏈 49ers experience packages (separate from the drawing)</li>
      </ul>
      <p style="color:#475569;font-size:13px;">Plus 180+ more — figure out what you want, who you're bidding with, and how much you're willing to spend. Some of these will go fast.</p>
      ${DRAWING_CARD_MEDIUM}
      <h3 style="color:#0b1b3c;font-size:16px;margin:24px 0 10px;">Your seats are confirmed.</h3>
      <p>If you selected seats before May 31, you should have received a confirmation email with your QR check-in code. If you didn't, reply to this email — we'll fix it.</p>
      <p style="color:#475569;font-size:13px;">— Sherry &amp; Kara</p>
    `,
  },
  s15: {
    type: 'email',
    subject: 'Two days to go — everything you need for gala night',
    body: `
      <p style="color:#0b1b3c;font-size:16px;font-weight:700;">Two days. Here's everything you need.</p>
      <p style="color:#1e293b;font-size:14px;line-height:1.9;">📍 <strong>Megaplex Centerville</strong> — 401 N 75 W, Centerville, UT 84014<br/>
      🅿 <strong>Parking</strong> — free, on-site, fills up — arrive 45 min early<br/>
      🎟 <strong>Check-in</strong> — opens 30 min before your social hour<br/>
      &nbsp;&nbsp;&nbsp;Early showing: social 4:00 PM · dinner 4:30 PM · movie 5:00 PM<br/>
      &nbsp;&nbsp;&nbsp;Late showing: social 6:00 PM · dinner 7:15 PM · movie 7:45 PM<br/>
      🍽 <strong>Dinner is plated</strong> — you'll be seated, served, and rolling into the movie<br/>
      👗 <strong>Dress</strong> — casual, comfy shoes (it's a theater)<br/>
      📱 <strong>Your QR code</strong> — already in your inbox from when you finalized seats. Bring your phone.</p>
      <div style="background:#f3f5f9;border-left:3px solid #1f4484;border-radius:8px;padding:14px 18px;margin:20px 0;">
        <p style="margin:0 0 4px;color:#1f4484;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">🔨 Bidding opens 6:00 AM, June 8 on Givi</p>
        <p style="margin:0;color:#0b1b3c;font-size:14px;line-height:1.5;">Browse now, register your Givi account, set up your max bids — bid Wednesday from anywhere. Disneyland trip, Jazz Toyota Club seats, Chick-fil-A for a year, signed art collection — and 180+ more.</p>
        <p style="margin:8px 0 0;"><a href="${AUCTION_LINK}" style="color:#1f4484;font-weight:700;text-decoration:underline;font-size:13px;">Register on Givi →</a></p>
      </div>
      ${DRAWING_CARD_MEDIUM}
      <p>If you have any questions, reply to this email. We see them.</p>
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and the team</p>
    `,
  },

  // ─── PHASE 5: DAY OF ───
  s16: {
    type: 'email',
    subject: '🔨 The auction is LIVE on Givi',
    body: `
      <p style="font-size:18px;color:#0b1b3c;font-weight:700;margin:0 0 12px;">It's gala day.</p>
      <p>The auction is now live on <strong>Givi</strong>. Bid from anywhere — phone, laptop, table at the gala. Set your max bid, get outbid alerts, and watch your favorites all night.</p>
      ${BTN(AUCTION_LINK, '🔨 BID NOW ON GIVI →', '#1f4484')}
      ${BTN(DRAWING_LINK, '🏈 ENTER THE 49ERS DRAWING →')}
      <p>We'll see you tonight at Megaplex.</p>
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and everyone at DEF</p>
    `,
  },
  sms9: { type: 'sms', body: '🔨 Auction LIVE on Givi. Drawing LIVE. Bid from your phone: ' + AUCTION_LINK + ' — see you tonight. DEF Gala' },
  sms10: { type: 'sms', body: 'Top items moving fast on Givi. 49ers drawing open. Bid: ' + AUCTION_LINK + ' — DEF Gala' },
  sms11: { type: 'sms', body: 'Auction closes in 15 min on Givi. Drawing closes with it. Last call: ' + AUCTION_LINK },
  sms12: { type: 'sms', body: '5 minutes left. Final bids on Givi. Final 49ers entries. ' + AUCTION_LINK },
  s17: {
    type: 'email',
    subject: "Thank you. And here's who won.",
    body: `
      <p style="font-size:18px;color:#0b1b3c;font-weight:700;margin:0 0 12px;">Thank you for an unforgettable night.</p>
      <p>Here's where we landed:</p>
      <ul style="color:#1e293b;font-size:15px;line-height:1.8;padding-left:20px;">
        <li><strong>49ers Opportunity Drawing winner:</strong> [NAME]</li>
        <li><strong>Top auction items:</strong> [TOP 3]</li>
        <li><strong>Most-bid item:</strong> [ITEM]</li>
      </ul>
      <p>Thank you for showing up.</p>
      <p style="color:#475569;font-size:13px;">— Sherry, Kara, and everyone at the Davis Education Foundation</p>
    `,
  },
};

// ── Handlers ───────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  // Return the registry of valid sendIds (no copy — just metadata for the dashboard)
  const ids = Object.entries(SENDS).map(([id, s]) => ({
    id,
    type: s.type,
    subject: s.subject || null,
  }));
  return jsonOk({ count: ids.length, sends: ids, testPhones: {
    scott: !!env.GALA_TEST_PHONE_SCOTT,
    sherry: !!env.GALA_TEST_PHONE_SHERRY,
  }});
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authed = await verifyGalaAuth(request, env.GALA_DASH_SECRET);
  if (!authed) return jsonError('Unauthorized', 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('Invalid JSON', 400); }

  const { sendId, recipients } = body;
  if (!sendId) return jsonError('sendId required', 400);
  if (!recipients) return jsonError('recipients required (scott|sherry|both)', 400);

  const baseSend = SENDS[sendId];
  if (!baseSend) return jsonError(`Unknown sendId: ${sendId}`, 404);

  // Source priority: marketing_sends (new admin editor, single source of
  // truth) → marketing_edits (legacy gala-review overrides, kept for safety
  // until that tool is fully retired) → in-code SENDS registry.
  let send = baseSend;
  try {
    if (env.GALA_DB) {
      const live = await env.GALA_DB.prepare(
        `SELECT subject, body FROM marketing_sends WHERE send_id = ?`
      ).bind(sendId).first();
      if (live && (live.subject || live.body)) {
        send = {
          ...baseSend,
          subject: live.subject || baseSend.subject,
          body: live.body || baseSend.body,
        };
      } else {
        // Legacy fallback — the row didn't exist in marketing_sends yet,
        // try the old marketing_edits override table.
        const legacy = await env.GALA_DB.prepare(
          `SELECT subject_override, body_override FROM marketing_edits WHERE send_id = ?`
        ).bind(sendId).first();
        if (legacy && (legacy.subject_override || legacy.body_override)) {
          send = {
            ...baseSend,
            subject: legacy.subject_override || baseSend.subject,
            body: legacy.body_override || baseSend.body,
          };
        }
      }
    }
  } catch (e) {
    // Don't block the send on a DB hiccup — fall back to baked-in copy.
    console.error('Override fetch failed, using default:', e.message);
  }

  const targets = resolveRecipients(env, recipients);
  if (targets.length === 0) return jsonError('No valid recipients', 400);

  const results = [];

  for (const t of targets) {
    if (send.type === 'email') {
      if (!t.email) {
        results.push({ recipient: t.label, channel: 'email', ok: false, error: 'No email on file' });
        continue;
      }
      const html = galaEmailHtml({
        firstName: t.label,
        body: `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin:0 0 18px;color:#92400e;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">⚠️ TEST SEND · ${sendId} · not for distribution</div>${send.body}`,
        footerLine: `Davis Education Foundation · Test Send · ${sendId} · ${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })} MT`,
      });
      const r = await sendEmail(env, {
        to: t.email,
        subject: `[TEST] ${send.subject}`,
        html,
        replyTo: env.GALA_ADMIN_EMAIL || 'smiggin@dsdmail.net',
      });
      results.push({ recipient: t.label, channel: 'email', to: t.email, ok: r.ok, error: r.error || null, id: r.id || null });
    } else if (send.type === 'sms') {
      if (!t.phone) {
        results.push({ recipient: t.label, channel: 'sms', ok: false, error: `No phone on file (set GALA_TEST_PHONE_${t.label.toUpperCase()} env var)` });
        continue;
      }
      const r = await sendSMS(env, t.phone, `[TEST ${sendId}] ${send.body}`);
      results.push({ recipient: t.label, channel: 'sms', to: t.phone, ok: r.ok, error: r.error || null, sid: r.sid || null });
    }
  }

  return jsonOk({ sendId, type: send.type, results });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
