// FaqPage — FAQ surface as a real page (not a modal).
//
// Replaces FaqModal for in-portal use 2026-05-18 per Scott's call:
// hamburger items navigate to real pages. URL changes, back button
// works, page-level scroll. FaqModal.jsx remains on disk for any
// other surface that still wants the popup affordance.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { config } from '../config.js';

const CATEGORY_LABELS = {
  vibe: 'What to expect',
  auction: 'Silent auction',
  schedule: 'Schedule & arrival',
  tickets: 'Tickets & pricing',
  movies: 'Movies & showings',
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

export function FaqPage({ token }) {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(`${config.apiBase}/api/gala/chat/faq`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        if (j && j.ok && Array.isArray(j.faq)) setFaqs(j.faq);
        else setFaqs([]);
      })
      .catch(() => {
        if (alive)
          setError(
            "Couldn't load the FAQ right now. Text Scott at 801-810-6642 and he'll help.",
          );
      });
    return () => { alive = false; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!faqs) return [];
    if (!q) return faqs;
    return faqs.filter(
      (f) =>
        (f.question || '').toLowerCase().includes(q) ||
        (f.answer || '').toLowerCase().includes(q),
    );
  }, [faqs, q]);

  const grouped = useMemo(() => {
    const m = {};
    for (const f of filtered) {
      const cat = f.category || 'logistics';
      (m[cat] = m[cat] || []).push(f);
    }
    return m;
  }, [filtered]);

  const cats = CATEGORY_ORDER.filter((c) => grouped[c]?.length).concat(
    Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  );

  const goHome = () => navigate(`/${token}`);

  return (
    <section className="p2-section p2-page">
      <button type="button" className="p2-back-link" onClick={goHome}>
        ← Back to your portal
      </button>

      <div className="p2-section-header">
        <div>
          <div className="p2-eyebrow">Got questions?</div>
          <h2>Frequently <span className="p2-italic-flair">asked</span></h2>
        </div>
      </div>

      <div className="p2-card stripped">
        <div className="p2-card-body">
          <input
            type="search"
            className="p2-faq-search"
            placeholder="Search the FAQ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {error && (
            <div className="p2-notice red" style={{ marginTop: 16 }}>
              <p>{error}</p>
            </div>
          )}
          {faqs === null && !error && (
            <p className="p2-faq-status">Loading…</p>
          )}
          {faqs !== null && filtered.length === 0 && !error && (
            <p className="p2-faq-status">
              No matches{q ? ` for “${query}”` : ''}.
            </p>
          )}

          {cats.map((cat) => (
            <div key={cat} className="p2-faq-group">
              <div className="p2-eyebrow">
                {CATEGORY_LABELS[cat] || cat}
              </div>
              {grouped[cat].map((f) => (
                <details
                  key={f.id}
                  className="p2-faq-item"
                  open={Boolean(q)}
                >
                  <summary>{f.question}</summary>
                  <div className="p2-faq-answer">{f.answer}</div>
                </details>
              ))}
            </div>
          ))}

          <p className="p2-faq-foot" style={{ marginTop: 24 }}>
            Still stuck? Text Scott — <a href="sms:+18018106642">801-810-6642</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
