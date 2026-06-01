# Auction Preview Page (`/auction`)

Public, no-bidding **preview** of the silent-auction catalog for DEF Gala 2026.
Live at `https://gala.daviskids.org/auction`.

- **Page:** `public/auction/index.html` — static, vanilla JS, matches the
  faq/schedule chrome (#0d1b3d navy masthead, Playfair Display + Inter, white
  page, blue→red strip). Search + tag-filter chips + sort. Lazy-loaded images.
- **Data:** `public/data/auction-items.json` — `{title, count, items[]}`.
  Each item: `id, number, title, desc, value, value_num, tags[], images[],
  status, raffle`.
- **No links to live bidding** by design — this is a preview; bidding opens at
  the event. A "preview" notice banner sets the expectation.
- Premier items badged red; the Opportunity Drawing (49ers) badged navy.

## Where the data comes from (Qgiv has no clean export)

The items live on the Qgiv/Bloomerang event `def2026` (auction **form/auctionId
1097071**). The public items page is a React app; a plain fetch only returns the
shell. The catalog is delivered over **Server-Sent Events**:

```
https://sse.qgiv.com/views/auction/auctions_sse.php?returnItemDescAsHTML=1&auctionId=1097071
```

The first SSE message (~1.1 MB) is `{status_code, response:{auction}}`, and
`auction.products[]` is the full catalog (title, description (HTML), tags,
fairMarketValue/displayItemValue, images[], categoryType, status, number…).
`auction.categories[]` lists the 4 Qgiv categories; the useful filtering
dimension is `product.tags` (Home, Outdoors, Kids, Dining & Entertainment,
Sports, Travel, Premier, …), not the (uniform) category name.

### Re-pull recipe (when items change before the event)

Headless render so the SSE stream populates, then read `auction.products`:

1. Playwright Chromium → goto the items URL (`wait_until="domcontentloaded"`;
   networkidle never fires because the SSE socket stays open).
2. Wrap `window.EventSource` in an init script to capture messages, wait ~15s.
3. Parse the largest message → `response.auction.products`.
4. Map to the item schema above, strip description HTML to plain text, format
   value from `displayItemValue` (fallback `fairMarketValue`), sort by value.
5. Write minified to `public/data/auction-items.json`, commit, push (auto-deploy).

`status`: 280 items are `1` (open category), 35 are `5` (built, non-private,
different Qgiv state). Current page includes **all 315** per Scott (2026-06-01).
To show only the open set, filter `status === "1"` in the load step.

## Deploy

Git-connected CF Pages project `gala`, production branch `main`,
`pages_build_output_dir = public`. Push to `main` → auto-deploy ~45s.
Static page needs no build step and no `_routes.json` change (it's not under any
Functions `include` pattern).
