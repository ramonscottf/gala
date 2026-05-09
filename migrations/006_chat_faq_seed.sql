-- Migration 006: Seed initial FAQ knowledge base for gala chatbot
-- Created 2026-05-08
--
-- These answers are embedded into the Haiku system prompt as authoritative
-- context. Keep answers crisp; the LLM rephrases for tone/specifics.
-- Update via /api/gala/chat/faq admin endpoint, no redeploy needed.

DELETE FROM chat_faq;

-- TICKETS & PRICING
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('tickets', 'When can I buy tickets?',
 'Donor early access opens May 11, 2026. Sponsorship tier holders (Gold, Silver, Bronze) follow shortly after. General individual ticket sales open after the sponsor and donor windows. Watch your email — the first invitation went out to registered attendees on May 28.',
 'when,buy,tickets,available,sale,open,access,early,donor,sponsor', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('tickets', 'How much do tickets cost?',
 'Pricing varies by sponsorship tier. Individual seats are also available once sponsor windows close. Visit gala.daviskids.org for current pricing, or tap "Live Help" above to talk with Scott directly about specifics.',
 'cost,price,how much,tier,sponsor,individual', 20);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('tickets', 'Can I refund or transfer my ticket?',
 'Tickets are non-refundable since the gala is a fundraiser, but if you cannot make it you can either gift your seat to someone else or convert it to a non-attending donation (still tax-deductible). Tap "Live Help" to coordinate either option.',
 'refund,cancel,transfer,gift,unable,not coming,donate seat', 30);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('tickets', 'Can I donate without attending?',
 'Yes! There is a "non-attending donation" option that is fully tax-deductible. Davis Education Foundation is a 501(c)(3). You will receive a tax receipt by email after your gift.',
 'donate,non-attending,not coming,tax,deductible,501', 40);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('tickets', 'How do I pay?',
 'You can pay by credit card during checkout, or by Venmo or check. If you pay by Venmo or check, the seat selection portal will hold your seats until payment clears. We collect mailing addresses for tax receipts.',
 'pay,payment,venmo,check,credit card,how to pay', 50);

-- THE NIGHT
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'When and where is the gala?',
 'Wednesday, June 10, 2026 at Megaplex Theatres at The Junction in Centerville, Utah. Address: 405 N Marketplace Dr, Centerville, UT 84014.',
 'when,where,date,location,address,megaplex,junction,centerville,2026', 5);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'What time should I arrive?',
 'For the early showing (movies at 4:30 PM), doors and dinner open at 4:00 PM — arrive 15-30 minutes before to allow time for check-in and to browse the silent auction. For the late showing (movies at 7:15 PM), doors open at 6:30 PM with dinner at 6:45 PM (or 7:02 PM in the premier theaters).',
 'arrive,arrival,time,early,when to come,doors,check in,parking', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'What time does the event start and end?',
 'There are two showings — you pick one when you book. Early showing: dinner at 4:00 PM, movies start 4:30 PM, ends roughly 6:45 PM. Late showing: dinner at 6:45 PM (7:02 PM in premier theaters), movies start 7:15 PM, ends roughly 9:30 PM (Star Wars runs longest at 132 min).',
 'start,begin,end,time,showing,when,early,late,4:30,7:15,length,how long', 15);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'Is dinner included?',
 'Yes, dinner is included with every ticket. Dinner is served before the movie in the theater lobby and concession area. Dietary restrictions can be accommodated — let us know in advance via Live Help.',
 'dinner,food,meal,eat,dietary,allergies,vegetarian,gluten', 20);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'Where do I park?',
 'Megaplex at The Junction has a large free parking lot adjacent to the theater. There is also overflow parking around the surrounding shopping area. Arrive a bit early on June 10 — it is a busy night.',
 'park,parking,car,lot,free', 25);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('night-of', 'What is the dress code?',
 'Cocktail attire is encouraged but not required. Many guests dress up since it is a gala, but wear what makes you comfortable for an evening at the theater.',
 'dress,wear,attire,formal,cocktail,casual,clothes', 30);

-- MOVIES
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('movies', 'What movies are showing?',
 'Four movies, each shown in its own theater: (1) Star Wars: The Mandalorian and Grogu (PG-13, 132 min) — premier and good tier theaters. (2) How to Train Your Dragon (PG, 98 min) — premier tier. (3) Paddington 2 (PG, 104 min) — good tier. (4) The Breadwinner (PG, 95 min, the new Nate Bargatze comedy) — good and mid tier. Plus two additional theaters held as overflow that may be assigned closer to the event.',
 'movies,films,what,showing,playing,star wars,mandalorian,grogu,dragon,paddington,breadwinner,bargatze', 5);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('movies', 'Which movies are kid-friendly?',
 'How to Train Your Dragon (PG, 98 min), Paddington 2 (PG, 104 min), and The Breadwinner (PG, 95 min) are all family-friendly. Star Wars: The Mandalorian and Grogu is rated PG-13 — best for ages 10 and up. We recommend matching the showing time to your kids'' bedtime: the early showing (4:30 PM) ends around 6:45 PM.',
 'kids,children,family,age,appropriate,rating,pg,pg-13,suitable,bedtime', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('movies', 'Can I bring my kids?',
 'Yes, kids are welcome with paid tickets. Match the movie rating and showtime to your kids — the early 4:30 PM showing is much more kid-friendly for bedtime, and Paddington 2 or How to Train Your Dragon are the most family-oriented choices. Childcare is not provided on-site.',
 'kids,children,bring,family,age,childcare,babysitting', 15);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('movies', 'What is the difference between premier, good, and mid theater tiers?',
 'Premier theaters are Megaplex''s largest auditoriums with the best seating and screens (theaters 7 and 8, capacity 200+). Good tier theaters are large with comfortable seating (theaters 1, 2, 4, 5, 9, 12). Mid tier theaters are smaller, more intimate auditoriums (theaters 3, 6, 10, 13). Higher tiers are paired with our most-anticipated films.',
 'tier,premier,good,mid,difference,theater,size,seating,quality', 20);

-- SEATING
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('seating', 'How does seat selection work?',
 'After you complete your purchase, you will receive an email with a personal link to the seat selection portal. There you can pick exact seats from a live theater map. Sponsors with multiple seats can either pick all seats themselves or delegate seat assignment to their guests.',
 'seat,select,selection,pick,choose,assign,how,where', 5);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('seating', 'Can my group sit together?',
 'Yes — when you select seats from the theater map, you can choose adjacent seats for your whole group. Groups can also coordinate by sharing the same showing and theater.',
 'group,together,sit,adjacent,family,friends,party', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('seating', 'I am a sponsor — how do I assign seats to my guests?',
 'Sponsors get a delegation tool in their portal. You can either pick every seat yourself, or send each guest their own personal link so they pick their own seat. Tap Live Help if you need a walkthrough.',
 'sponsor,delegate,guest,assign,team,group,multiple,seats', 15);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('seating', 'What if I bought a ticket late?',
 'Late buyers get whatever seats remain at the time of purchase. The portal shows real-time availability so you can see what is open. Popular movies (Star Wars, How to Train Your Dragon) tend to fill premier theaters first.',
 'late,last minute,remaining,available,leftover,still open', 20);

-- DONATIONS / AUCTION
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('donations', 'How does the silent auction work?',
 'The silent auction runs throughout the evening. You can browse and bid on items in the lobby before the movie and during dinner. Winners are announced near the end of the evening. Mobile bidding may also be available.',
 'auction,silent,bid,bidding,items,how,when', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('donations', 'Where do the funds go?',
 'All proceeds support Davis Education Foundation programs serving students and educators in Davis School District: classroom grants, teacher scholarships, Child Spree (back-to-school clothing for students in need), and other initiatives that benefit Davis kids.',
 'funds,money,donation,where,go,benefit,foundation,students,teachers,child spree', 15);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('donations', 'Is my donation tax-deductible?',
 'Yes. Davis Education Foundation is a 501(c)(3) nonprofit. You will receive a tax receipt by email. For tickets, the deductible portion is the amount above the fair market value of dinner and entertainment.',
 'tax,deductible,receipt,501,nonprofit,write off,deduction', 20);

-- LOGISTICS
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('logistics', 'Is the venue accessible?',
 'Yes. Megaplex at The Junction is fully ADA accessible — wheelchair seating, accessible parking, and accessible restrooms. Let us know in advance via Live Help if you need specific accommodations and we will reserve appropriate seats.',
 'accessible,ada,wheelchair,disability,accommodation,handicap,mobility', 10);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('logistics', 'Will there be photography or press?',
 'Yes, there will be event photography for foundation use (social media, annual report, marketing). If you prefer not to be photographed, let a volunteer know at check-in and we will note your preference.',
 'photo,photography,press,photograph,picture,opt out,privacy', 20);
INSERT INTO chat_faq (category, question, answer, keywords, priority) VALUES
('logistics', 'I have a question that is not answered here.',
 'Tap "Live Help" at the top of this chat and Scott will get back to you personally. For urgent matters, you can also email Sherry at smiggin@dsdmail.net.',
 'help,question,contact,who,email,scott,sherry,urgent,not listed', 30);
