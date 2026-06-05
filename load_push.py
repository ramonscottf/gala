import json, urllib.request

ACCT="77f3d6611f5ceab7651744268d434342"
DBID="1468a0b3-cc6c-49a6-ad89-421e9fb00a86"
URL=f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/d1/database/{DBID}/query"
H={"X-Auth-Email":"ramonscottf@gmail.com","X-Auth-Key":"b6bc70427e86661fc4fd23e84821f79f43d31","Content-Type":"application/json"}

P={"phase":6,"phase_title":"Register Push (Public)","phase_color":"#aa0000",
   "phase_desc":"Public acquisition push: drive gala registration, 49ers drawing entries, and Monday bidding. Audience = broad public/unregistered (NOT sponsor tiers).",
   "phase_range":"June 5 - June 8"}

NOTE_BASE=("DRAFT loaded by Skippy Jun 5. AUDIENCE = PUBLIC/unregistered. \u26a0\ufe0f The gala send engine resolves SPONSOR TIERS ONLY \u2014 'Preview & send' will resolve 0 here. Real public reach = MailerLite (email) + Twilio public list (SMS). Static links, NO {TOKEN}. Reply-To=Sherry. All links \u2192 /auction/.")

LINK="https://gala.daviskids.org/auction/"

# Email bodies (inner-HTML blocks; v6 shell wrapped by send layer; NO images)
fri_email=(
'<p style="font-size:18px;font-weight:700;color:#1f4484;margin:0 0 8px;">Five days to the DEF Gala. Are you in the room?</p>'
'<p style="margin:0 0 14px;">Wednesday, <strong>June 10</strong> at the Megaplex in Centerville &mdash; <em>Lights, Camera, Take Action!</em>, the Davis Education Foundation\u2019s night to fund school lunch, classroom grants, and the kids who need a hand. Registering takes a minute, and it\u2019s how you get your seat.</p>'
'<p style="margin:0 0 6px;font-weight:700;color:#aa0000;">And this year, one guest leaves with the trip of a lifetime.</p>'
'<div style="border:1px solid #e3c98b;border-top:4px solid #aa0000;background:#fffdf7;border-radius:12px;padding:20px 22px;margin:16px 0 18px;">'
'<p style="margin:0 0 10px;font-size:16px;font-weight:800;color:#aa0000;">\U0001f3c8 The 49ers Home Game Getaway</p>'
'<p style="margin:0 0 12px;">Six lower-bowl seats (Row 19, Levi\u2019s Stadium) to any <strong>2026&ndash;27 49ers home game of your choice</strong>, plus a <strong>$2,000 travel &amp; expense card</strong>. A ~$5,000 trip &mdash; and there are only <strong>200 entries total</strong>.</p>'
'<p style="margin:0;color:#555;font-size:14px;">Each $100 donation to school lunch = one entry. Drawing held at the Gala, June 10. Season tickets donated by Todd Hughes of Hughes General Contractors.</p>'
'</div>'
f'<p style="text-align:center;margin:22px 0;"><a href="{LINK}" style="display:inline-block;background:#1f4484;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;">Register + enter the drawing &rarr;</a></p>'
'<p style="margin:0;color:#555;font-size:14px;">See you at the movies. \U0001f3ac</p>'
)

sat_email=(
'<p style="font-size:18px;font-weight:700;color:#aa0000;margin:0 0 8px;">\U0001f3c8 Six seats. Your pick of any home game. One winner.</p>'
'<p style="margin:0 0 14px;">The Davis Education Foundation is giving away a <strong>49ers Home Game Getaway</strong> &mdash; and the math is simple: only <strong>200 entries exist</strong>, and each one is $100 toward school lunch.</p>'
'<div style="border:1px solid #e3c98b;border-top:4px solid #aa0000;background:#fffdf7;border-radius:12px;padding:20px 22px;margin:16px 0 18px;">'
'<p style="margin:0 0 10px;font-size:16px;font-weight:800;color:#aa0000;">What the winner takes home</p>'
'<p style="margin:0 0 6px;"><strong>6 lower-bowl tickets</strong> &mdash; Row 19 at Levi\u2019s Stadium, close enough to hear the snap counts.</p>'
'<p style="margin:0 0 6px;"><strong>Any 2026&ndash;27 home game</strong> &mdash; your choice of opponent.</p>'
'<p style="margin:0 0 6px;"><strong>$2,000 travel &amp; expense card</strong> &mdash; flights, hotel, dinner, all of it.</p>'
'<p style="margin:0;color:#555;font-size:14px;">~$5,000 value \u00b7 one drawing \u00b7 winner need not be present. Tickets donated by Todd Hughes, Hughes General Contractors.</p>'
'</div>'
'<p style="margin:0 0 14px;">The drawing is held at the Gala on <strong>June 10</strong>. Enter now &mdash; and while you\u2019re there, <strong>register for the gala</strong> so you\u2019re in the room when the winner is drawn.</p>'
f'<p style="text-align:center;margin:22px 0;"><a href="{LINK}" style="display:inline-block;background:#aa0000;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;">Enter the drawing + register &rarr;</a></p>'
)

mon_email=(
'<p style="font-size:18px;font-weight:700;color:#1f4484;margin:0 0 8px;">\U0001f528 The silent auction is officially open.</p>'
'<p style="margin:0 0 14px;">Bidding is now live in the <strong>Givi app</strong> &mdash; browse the full catalog and bid from your phone all the way through gala night, <strong>June 10</strong>. No need to wait for the doors to open.</p>'
'<p style="margin:0 0 14px;font-weight:700;">Two minutes gets you set:</p>'
'<ol style="margin:0 0 16px;padding-left:22px;">'
'<li style="margin-bottom:7px;"><strong>Register for the gala</strong> and download <strong>Givi</strong> from the auction page.</li>'
'<li style="margin-bottom:7px;"><strong>Start bidding</strong> &mdash; set a max bid and Givi pings you the moment you\u2019re outbid.</li>'
'<li style="margin-bottom:0;"><strong>Enter the 49ers drawing</strong> before it closes June 10 &mdash; only 200 entries, $100 each, for 6 lower-bowl seats + a $2,000 travel card.</li>'
'</ol>'
f'<p style="text-align:center;margin:22px 0;"><a href="{LINK}" style="display:inline-block;background:#1f4484;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;">Register + start bidding &rarr;</a></p>'
'<p style="margin:0;color:#555;font-size:14px;">Every bid and every entry feeds a Davis County kid. Thank you. \U0001f3ac</p>'
)

fri_sms=("5 days to the DEF Gala (June 10) \u2014 and one guest wins 6 lower-bowl 49ers tickets + a $2,000 travel card. "
         f"Register + enter the drawing (only 200 entries, $100 each): {LINK} \u2014 DEF Gala")
sat_sms=("\U0001f3c8 Your pick of ANY 2026-27 49ers home game. 6 lower-bowl seats + $2,000 travel card (~$5,000 trip) \u2014 and only 200 entries exist, $100 each. "
         f"Drawing June 10 at the DEF Gala. Get in + register: {LINK} \u2014 DEF Gala")
mon_sms=("\U0001f528 Bidding is OPEN. The DEF Gala silent auction just went live in the Givi app \u2014 bid from your phone all week. "
         f"Not registered? Sign up + enter the 49ers drawing before it closes June 10: {LINK} \u2014 DEF Gala")

rows=[
 ("push-fri-email","Email","Jun 5","10:00 AM","Fri - Register + 49ers (Email)","5 days out - and a 49ers trip is on the line \U0001f3c8",fri_email,200,
   NOTE_BASE+" DAY 1 = register-led, 49ers hook. Send ~10:00 AM Fri Jun 5."),
 ("push-fri-sms","SMS","Jun 5","12:30 PM","Fri - Register + 49ers (SMS)","Fri - Register + 49ers",fri_sms,205,
   NOTE_BASE+" DAY 1 SMS. ~225 chars. Optional MMS hero: assets.daviskids.org/gala-2026/sms-hero.png."),
 ("push-sat-sms","SMS","Jun 6","10:00 AM","Sat - 49ers + Register (SMS)","Sat - 49ers + Register",sat_sms,210,
   NOTE_BASE+" DAY 2 = 49ers-led scarcity. ~250 chars. Weekend 10am."),
 ("push-sat-email","Email","Jun 6","11:00 AM","Sat - 49ers + Register (Email)","Only 200 chances at the 49ers trip of a lifetime",sat_email,215,
   NOTE_BASE+" DAY 2 = 49ers-led, register secondary. Red CTA."),
 ("push-mon-sms","SMS","Jun 8","8:00 AM","Mon - Register + Bidding Opens (SMS)","Mon - Bidding is open",mon_sms,220,
   NOTE_BASE+" DAY 3 = bidding opens. \u26a0\ufe0f Confirm Givi bidding is LIVE before send. ~245 chars."),
 ("push-mon-email","Email","Jun 8","9:00 AM","Mon - Register + Bidding Opens (Email)","\U0001f528 Bidding is open - register and start now",mon_email,225,
   NOTE_BASE+" DAY 3. \u26a0\ufe0f Assumes /auction/ shows Givi download + register form by send time (preview\u2192landing switch)."),
]

cols=["send_id","phase","phase_title","phase_color","phase_desc","phase_range","channel","date","time","audience","status","title","subject","body","notes","sort_order","updated_by"]
ph=",".join(["("+",".join(["?"]*len(cols))+")"]*len(rows))
sql=f"INSERT INTO marketing_sends ({','.join(cols)}) VALUES {ph}"
params=[]
for (sid,ch,dt,tm,title,subj,body,so,note) in rows:
    params += [sid,P["phase"],P["phase_title"],P["phase_color"],P["phase_desc"],P["phase_range"],
               ch,dt,tm,"Public / Unregistered","upcoming",title,subj,body,note,so,"skippy"]

req=urllib.request.Request(URL,data=json.dumps({"sql":sql,"params":params}).encode(),headers=H,method="POST")

try:
    resp=json.load(urllib.request.urlopen(req,timeout=40))
except urllib.error.HTTPError as e:
    print("HTTP",e.code); print(e.read().decode()[:1500]); import sys; sys.exit()
print("success:",resp.get("success"))
if resp.get("errors"): print("errors:",resp["errors"])
meta=resp.get("result",[{}])[0].get("meta",{})
print("rows_written:",meta.get("changes"),"last_row_id:",meta.get("last_row_id"))
