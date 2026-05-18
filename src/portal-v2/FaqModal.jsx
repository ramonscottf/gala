// FaqModal — v2-native FAQ surface (P1.1).
//
// v1 NightTab pulled /api/gala/chat/faq (34 entries, search +
// accordion). v2 had only static "Night of" cards. This fetches the
// same canonical endpoint (also feeds gala.daviskids.org/faq and the
// Booker chatbot) and renders it in the v2 modal shell with native
// <details> accordions. Search auto-expands matching items.

import { useEffect, useMemo, useState } from 'react';
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

export function FaqModal({ onClose }) {
  const [faqs, setFaqs] = useState(null); // null = loading
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
    return () => {
      alive = false;
    };
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

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="p2-modal stripped">
        <div className="p2-modal-header">
          <div>
            <div className="p2-modal-eyebrow">Got questions?</div>
            <div className="p2-modal-title">Frequently asked</div>
          </div>
          <button
            type="button"
            className="p2-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="p2-modal-body">
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
        </div>
        <div className="p2-modal-footer">
          <span className="p2-faq-foot">
            Still stuck? Text Scott — 801-810-6642.
          </span>
          <button type="button" className="p2-btn sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
