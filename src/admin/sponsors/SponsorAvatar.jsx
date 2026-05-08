import React, { useState } from 'react';

/**
 * Circular sponsor avatar — DEF-navy background with the sponsor's white
 * logo centered. Falls back to a monogram (initials of company name) when
 * no logo is available. Used in SponsorRow headers.
 */
export function SponsorAvatar({ sponsor, size = 44 }) {
  const [errored, setErrored] = useState(false);
  const url = sponsor.logo_url;
  const name = sponsor.company || '';
  const monogram = makeMonogram(name);

  const showImg = url && !errored;

  return (
    <div
      className="gs-avatar"
      style={{ width: size, height: size }}
      aria-label={name ? `${name} logo` : 'Sponsor logo'}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <span className="gs-avatar-mono" style={{ fontSize: size * 0.36 }}>
          {monogram}
        </span>
      )}
    </div>
  );
}

function makeMonogram(name) {
  if (!name) return '?';
  // Strip parens content, drop common stop words.
  const cleaned = name
    .replace(/\([^)]*\)/g, '')
    .replace(/[\*]/g, '')
    .replace(/\b(and|the|of|for|inc|llc|corp|co)\b/gi, '')
    .trim();
  const words = cleaned.split(/[\s,&\-/]+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
