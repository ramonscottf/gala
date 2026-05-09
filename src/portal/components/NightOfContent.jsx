// NightOfContent — V2 R6 (FAQ port)
//
// Replaces the old timeline + 4-tile component. The previous copy
// had wrong times, formal voice, and pointed help to Sherry's email
// (which is why people were calling/texting Scott directly instead).
//
// This is the same FAQ content that powers gala.daviskids.org/faq —
// pulled from /api/gala/chat/faq (34 entries across 7 categories,
// canonical source of truth, also feeds Booker the chatbot). Same
// UX as the public page (search + accordion + category groups) but
// styled for the dark portal shell.
//
// Design decisions:
//   - Search at the top, sticky-ish (in the natural scroll flow)
//   - Categories rendered in the same canonical order as /faq
//   - <details> / <summary> for native accordion semantics — no
//     custom open/close state needed
//   - When the user types a search query, all matching items
//     auto-expand so the answer is visible immediately
//   - "Still have a question?" CTA at the bottom that opens Booker
//     by clicking the global chat bubble (same trigger the public
//     FAQ uses)
//   - Compact mode for the desktop modal context — drops outer
//     padding (the modal already has 24px container padding)

import { useEffect, useState } from 'react';
import { BRAND, FONT_DISPLAY, FONT_UI } from '../../brand/tokens.js';

const CATEGORY_LABELS = {
  vibe: 'What to expect',
  auction: 'Silent auction',
  tickets: 'Tickets & pricing',
  movies: 'Movies & showings',
  schedule: 'Schedule & arrival',
  seating: 'Seat selection',
  logistics: 'Venue & logistics',
};
const CATEGORY_ORDER = [
  'vibe',
  'auction',
  'schedule',
  'tickets',
  'movies',
  'seating',
  'logistics',
];

export default function NightOfContent({ compact = false }) {
  const [faqs, setFaqs] = useState(null); // null = loading, [] = loaded empty, [...] = loaded
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gala/chat/faq')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setFaqs(Array.isArray(d?.faq) ? d.faq : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Could not load FAQs');
        setFaqs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const outerPadding = compact ? 0 : '0 22px 24px';

  if (faqs === null) {
    return (
      <div style={{ padding: outerPadding, fontFamily: FONT_UI }}>
        <div style={loadingStyle}>Loading…</div>
      </div>
    );
  }

  if (error || faqs.length === 0) {
    return (
      <div style={{ padding: outerPadding, fontFamily: FONT_UI }}>
        <div style={loadingStyle}>
          {error
            ? "Couldn't load. Tap the chat bubble for help."
            : 'No questions to show yet.'}
        </div>
      </div>
    );
  }

  // Filter by search query (matches question, answer, keywords)
  const q = query.trim().toLowerCase();
  const filtered = q
    ? faqs.filter((f) => {
        const hay = `${f.question || ''} ${f.answer || ''} ${f.keywords || ''}`.toLowerCase();
        return hay.includes(q);
      })
    : faqs;

  // Group by category, then order categories
  const grouped = {};
  for (const f of filtered) {
    const cat = f.category || 'logistics';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  }
  const orderedCats = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div style={{ padding: outerPadding, fontFamily: FONT_UI }}>
      {/* Search */}
      <div style={{ marginTop: 8, marginBottom: 14 }}>
        <input
          type="search"
          placeholder="Search… try 'parking' or 'kids'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid var(--rule)`,
            color: 'var(--ink-on-ground)',
            fontSize: 14,
            fontFamily: FONT_UI,
            outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div style={loadingStyle}>
          No matches. Tap the chat bubble for help.
        </div>
      )}

      {orderedCats.map((cat) => (
        <section key={cat} style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--accent-text)',
              margin: '0 0 8px',
              letterSpacing: -0.2,
            }}
          >
            {CATEGORY_LABELS[cat] || cat}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[cat].map((f) => (
              <FaqItem key={f.id} item={f} forceOpen={!!q} />
            ))}
          </div>
        </section>
      ))}

      {/* CTA — points at Booker (global chat bubble) instead of email
          Sherry. The bubble's class is .gx-bubble-btn (matches the
          public FAQ page) and is mounted on every portal page via
          chat-widget.js. */}
      <BookerCta />
    </div>
  );
}

function FaqItem({ item, forceOpen }) {
  // <details> manages its own open/close state, but when the user
  // searches we want every match to expand automatically. React
  // syncs the `open` attribute when forceOpen flips.
  return (
    <details
      open={forceOpen || undefined}
      style={{
        background: 'var(--surface)',
        border: `1px solid var(--rule)`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          padding: '14px 16px',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink-on-ground)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ flex: 1, lineHeight: 1.35 }}>{item.question}</span>
        <span
          aria-hidden
          style={{
            fontSize: 18,
            color: 'var(--mute)',
            flexShrink: 0,
            transition: 'transform 0.15s',
          }}
          className="faq-chevron"
        >
          +
        </span>
      </summary>
      <div
        style={{
          padding: '0 16px 14px',
          fontSize: 13,
          color: 'rgba(255,255,255,0.78)',
          lineHeight: 1.55,
          whiteSpace: 'pre-line', // FAQ answers contain \n line breaks
        }}
      >
        {item.answer}
      </div>
    </details>
  );
}

function BookerCta() {
  const openBooker = () => {
    // Same hook as the public FAQ page — find the global chat
    // bubble and click it. The chat widget is mounted on every
    // gala.daviskids.org page so this works in both portals and
    // public pages without extra wiring.
    const btn = document.querySelector('.gx-bubble-btn');
    if (btn) btn.click();
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: '20px 18px',
        borderRadius: 14,
        background: 'rgba(168,177,255,0.06)',
        border: `1px solid rgba(168,177,255,0.18)`,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--ink-on-ground)',
          marginBottom: 6,
          letterSpacing: -0.2,
        }}
      >
        Still have a question?
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--mute)',
          lineHeight: 1.45,
          marginBottom: 12,
        }}
      >
        Booker is the chat bubble in the corner. He has every answer in here
        plus a lot more — and if he can't help, he'll get Scott on it.
      </div>
      <button
        type="button"
        onClick={openBooker}
        style={{
          all: 'unset',
          cursor: 'pointer',
          boxSizing: 'border-box',
          padding: '11px 22px',
          borderRadius: 99,
          background: 'linear-gradient(135deg,#a8b1ff,#6f75d8)',
          color: BRAND.navyDeep,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0.3,
        }}
      >
        Ask Booker →
      </button>
    </div>
  );
}

const loadingStyle = {
  textAlign: 'center',
  padding: '32px 16px',
  fontSize: 13,
  color: 'var(--mute)',
};
