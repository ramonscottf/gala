-- 007_chat_faq_v2.sql
-- May 9, 2026 — Rewrite of chat_faq seed to match the actual gala vibe.
--
-- The original v1 seed (006_chat_faq_seed.sql, 25 entries) read like a
-- corporate event website — "cocktail attire encouraged," "silent auction
-- runs throughout the evening," etc. None of that was right.
--
-- The actual event is casual: a movie theater gala. Social hour is on
-- the Megaplex patios with music, chips & salsa, drinks, and Nothing
-- Bundt Cakes (one of the sponsors). Auction items are displayed in the
-- lobby for browsing. Dinner is served IN the auditorium during the
-- movie. Dress code is whatever makes you comfortable.
--
-- This migration replaces the entire FAQ set with 32 entries across 7
-- categories: vibe, auction, tickets, movies, schedule, seating,
-- logistics. The new "vibe" category up front sets the casual tone
-- before users dig into details.
--
-- Run via: applied directly to gala-seating D1 on May 9 2026.

DELETE FROM chat_faq;

-- ━━ VIBE — sets the casual tone first ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('vibe', 'What''s the vibe of this thing?',
 'Super casual, fun night out. You''ll show up to a real movie theater, hang outside on the patios for social hour with music and snacks, browse the auction items, then settle in for a movie with dinner. No stuffy ballroom, no plated formal anything. Come as you are.',
 'vibe casual fun atmosphere style relaxed', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('vibe', 'What''s the dress code?',
 'Casual. The gala is at a movie theater, not a banquet hall, so dress comfortably. Some people dress up because it''s still a ''gala,'' but jeans are completely fine. Wear what makes you happy.',
 'dress code attire clothing what to wear casual jeans suit', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('vibe', 'What happens before the movie?',
 'Social hour outside on the Megaplex patios. There''s music, chips and salsa, drinks, and Nothing Bundt Cakes. Inside the lobby, all the silent auction items are displayed — you can walk around and browse them, place bids on your phone, and chat with friends. It''s the most fun part of the night for a lot of people.',
 'before movie social hour patio music snacks browse auction bundt cakes preshow', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('vibe', 'Is dinner really in the movie theater?',
 'Yes! Dinner is served in your auditorium right before the movie starts. You''ll find your assigned seat, get comfortable, and your dinner is brought to you. It''s a real movie theater experience with a meal — that''s part of what makes this gala different from every other one.',
 'dinner food meal auditorium served theater eating', 4, 1);

-- ━━ AUCTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('auction', 'How does the silent auction work?',
 'Easy. Browse the items in the lobby during social hour, then bid from your phone — no paper bid sheets. The auction is on Bloomerang (the platform Davis Ed Foundation uses for fundraising). You''ll get a link to register and bid. Bidding stays open through the social hour and dinner; it closes at 6:30 PM, between the two movie showings.',
 'silent auction bidding bloomerang qgiv mobile phone how', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('auction', 'What''s in the auction?',
 'Over 200 items donated by local businesses and supporters. A taste: Lifetime kayaks and a basketball hoop, a Ninja Woodfire outdoor grill, NBA Jazz tickets with Toyota Club access, pickleball lessons at The Picklr, Scheels gift cards, restaurant packages, family experiences, vacation getaways, sports memorabilia, and a ton of really good baskets put together by board members. You''ll see everything when you walk into the lobby.',
 'auction items what''s in prizes kayak grill jazz tickets pickleball baskets', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('auction', 'Do I have to bid to come?',
 'Not at all. The auction is there for people who want to participate, but plenty of guests just enjoy the social hour, the dinner, and the movie. Browse if you want, bid if you want, neither is required.',
 'must bid required participation optional', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('auction', 'When does bidding close?',
 '6:30 PM, in between the two movie showings. The 49ers raffle drawing winner is announced around the same time. If you win something, you''ll get a notification and can pick up your items at the checkout table after the second showing ends.',
 'auction close time end bidding 49ers raffle winner', 4, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('auction', 'Where do the funds go?',
 'Every dollar supports Davis Education Foundation programs for students and educators in Davis School District: classroom grants for teachers, scholarships, Child Spree (back-to-school clothing for kids in need), STEM and arts programming, and emergency assistance for families. It all stays local.',
 'funds money where go proceeds programs def benefit', 5, 1);

-- ━━ TICKETS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('tickets', 'How do I get tickets?',
 'Donor early access opens May 11, 2026. Sponsorship tier holders (Gold, Silver, Bronze) follow shortly after. General individual tickets open after the sponsor and donor windows close. Visit gala.daviskids.org or message Sherry at smiggin@dsdmail.net.',
 'tickets buy purchase get when open sales', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('tickets', 'How much do tickets cost?',
 'It varies by sponsorship tier — sponsors get groups of seats at a discount. Individual seats are also available once sponsor windows close. Pricing details are on gala.daviskids.org. For the most current numbers, just ask me here or reach out to Sherry.',
 'cost price how much tickets ticket price', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('tickets', 'Can I refund or transfer my ticket?',
 'Tickets are non-refundable since this is a fundraiser, but if something comes up you can absolutely give your seat to someone else, or convert it to a non-attending donation (still 100% tax-deductible). Just let us know.',
 'refund transfer cancel give away non-attending', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('tickets', 'Can I donate without coming?',
 'Yes — ''non-attending donation'' is an option. Davis Education Foundation is a 501(c)(3), so it''s fully tax-deductible. You''ll get a tax receipt by email. Same impact, no obligation to show up.',
 'donate without attending tax deductible non-attending', 4, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('tickets', 'How do I pay?',
 'Credit card during checkout is easiest. Venmo and check also work — if you pay by Venmo or check, your seats are held in the portal until payment clears.',
 'pay payment credit card venmo check', 5, 1);

-- ━━ MOVIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('movies', 'What movies are showing?',
 'Four movies, each in its own theater, so everyone picks what they want to see: Star Wars: The Mandalorian and Grogu (PG-13), How to Train Your Dragon (PG, family-friendly), Paddington 2 (PG, the all-time crowd pleaser), and The Breadwinner (PG, the new Nate Bargatze comedy). When you book your seat, you pick the movie and the showing time.',
 'movies films what showing star wars dragon paddington breadwinner', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('movies', 'Which movies are kid-friendly?',
 'How to Train Your Dragon, Paddington 2, and The Breadwinner are all PG and great for families. Star Wars is PG-13 — fine for older kids, but keep that in mind for younger ones. The early showing (around 4:30 PM) is the better choice for kids since it ends earlier.',
 'kids family children kid-friendly age rating', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('movies', 'Can I bring my kids?',
 'Yes, kids are welcome with paid tickets. Match the movie to the kid: How to Train Your Dragon and Paddington 2 are home runs for younger ones. The early showing wraps before bedtime for most kids.',
 'bring kids children allowed family tickets', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('movies', 'What''s the difference between premier, good, and mid theater tiers?',
 'Premier theaters (auditoriums 7 and 8) are Megaplex''s biggest — best screens, recliner seats, the works. Good tier (1, 2, 4, 5, 9, 12) are large theaters with great comfortable seating. Mid tier (3, 6, 10, 13) are smaller but still solid. Sponsors at higher tiers get seats in premier and good auditoriums first.',
 'theater tier premier good mid auditorium difference', 4, 1);

-- ━━ SCHEDULE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('schedule', 'When does it start?',
 'Doors open at 3:15 PM. Social hour on the patios runs from then until your showing starts. Pick the early showing if you have kids or like an earlier night; pick the late showing if you''d rather the evening unfold gradually.',
 'when start time begin doors open', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('schedule', 'What''s the schedule for the night?',
 '3:15 PM doors open, social hour begins on the patios with music and snacks, and the auction is open in the lobby. Around 4:00 PM, early showing guests find their auditoriums; movies start about 4:30 PM with dinner served in your seat. First showing ends around 6:15 PM, auction closes at 6:30, and the 49ers raffle winner is drawn. Late showing takes their seats at 6:45, movies start at 7:30, and the night ends around 9:30.',
 'schedule timeline when what time start end agenda', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('schedule', 'When should I arrive?',
 'Get there about 30-45 minutes before your showing. That gives you time to park, check in, walk through the auction, hang out on the patio, and grab a drink before settling in. Earlier is better than later — the social hour is one of the best parts.',
 'arrive when arrive early parking time check in', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('schedule', 'Where do I park?',
 'Megaplex at Legacy Crossing in Centerville has a huge free parking lot right next to the theater, plus overflow parking around the surrounding shopping center. Lots of spaces. The address is 1075 W Legacy Crossing Blvd, Centerville, UT.',
 'park parking where lot megaplex centerville address', 4, 1);

-- ━━ SEATING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('seating', 'How does seat selection work?',
 'After you buy tickets, you''ll get an email with a personal link to the seat selection portal. There you''ll see a live theater map and pick exact seats. Sponsors with multiple seats can either pick everything themselves or send their guests their own personal links to pick.',
 'seat selection pick choose seats how', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('seating', 'Can my group sit together?',
 'Yes. When you select seats, you can pick adjacent seats for your whole group on the theater map. Just make sure everyone in your group is going to the same showing and same movie.',
 'group together adjacent friends family same', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('seating', 'I''m a sponsor — how do I assign seats to my guests?',
 'Sponsor portal has a delegation tool. You can either pick every seat yourself, or send each guest their own personal link to pick their own. If you want help with this, message me here and I''ll walk you through it.',
 'sponsor delegate assign guests seats group host', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('seating', 'I''m buying late — what seats are left?',
 'Whatever''s still available at the time you book. The portal shows real-time availability, so you''ll see exactly what''s open. Popular movies (Star Wars, Dragon) and premier theaters tend to fill first — earlier is better if you have a preference.',
 'late buying seats remaining available leftover', 4, 1);

-- ━━ LOGISTICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'Is the venue accessible?',
 'Fully ADA accessible — wheelchair seating, accessible parking right by the entrance, and accessible restrooms. If you have specific needs (sign language, mobility, anything), let me know here and we''ll make sure everything''s ready for you.',
 'ada accessible wheelchair disability accessibility needs', 1, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'Will there be photography?',
 'Yes, an event photographer for foundation use (social media, newsletters, annual report). If you''d rather not be photographed, just let a volunteer or me know at check-in and we''ll keep you out of frame.',
 'photo photography pictures camera press media', 2, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'Where exactly is this happening?',
 'Megaplex Theatres at Legacy Crossing, 1075 W Legacy Crossing Blvd, Centerville, UT 84014. It''s the Megaplex with the patios out front — that''s where social hour happens.',
 'venue location address where megaplex centerville', 3, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'Dietary restrictions — can you accommodate?',
 'Yes. When you RSVP there''s a spot to flag dietary needs (vegetarian, gluten-free, allergies, etc.). The catering team works around them. If you have something specific or unusual, message me and we''ll make sure it''s handled.',
 'dietary food allergies vegetarian gluten free vegan needs restrictions', 4, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'Can I bring my own drink? What about alcohol?',
 'Drinks are provided during social hour — soft drinks, water, and other non-alcoholic options. Megaplex doesn''t serve alcohol, and outside drinks aren''t allowed. Plan accordingly if that matters to you.',
 'drinks alcohol byob beverages soda water', 5, 1);

INSERT INTO chat_faq (category, question, answer, keywords, priority, active) VALUES
('logistics', 'I have a question that''s not here.',
 'Just ask me — I can answer most things. For something I can''t handle, message Sherry directly at smiggin@dsdmail.net or just describe what you need and I''ll route it to the right person.',
 'other question help contact sherry email', 6, 1);
