// CelebrationOverlay — full-screen "you're all set" moment.
//
// Triggers after the user commits seats inside the SeatPickerModal.
// Visual language: warm gold glow expanding from center, Fraunces
// serif headline, seat labels lighting up in sequence. NOT confetti —
// Scott specifically asked for glow + completion feeling, not
// kinetic chaos. Holds for ~4 seconds then auto-dismisses, or tap
// anywhere to close early. Used once-per-session-per-pick: parent
// component decides when to mount this.

import { useEffect, useState } from 'react';

export function CelebrationOverlay({ seats, movieTitle, onClose, autoDismissMs = 4500 }) {
  const [phase, setPhase] = useState('glow'); // glow → bloom → settle

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('bloom'), 250);
    const t2 = setTimeout(() => setPhase('settle'), 1400);
    const t3 = setTimeout(onClose, autoDismissMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [autoDismissMs, onClose]);

  return (
    <div
      className={`p2-celebrate ${phase}`}
      onClick={onClose}
      role="dialog"
      aria-label="Seats placed"
    >
      <div className="p2-celebrate-glow" aria-hidden="true" />
      <div className="p2-celebrate-rays" aria-hidden="true" />

      <div className="p2-celebrate-inner">
        <div className="p2-celebrate-eyebrow">Seats placed</div>
        <h1 className="p2-celebrate-headline">
          You're <span className="p2-celebrate-flair">all set</span>.
        </h1>
        {movieTitle && (
          <div className="p2-celebrate-movie">{movieTitle}</div>
        )}
        {seats && seats.length > 0 && (
          <div className="p2-celebrate-seats">
            {seats.map((s, i) => (
              <span
                key={s}
                className="p2-celebrate-seat"
                style={{ animationDelay: `${500 + i * 110}ms` }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="p2-celebrate-hint">Tap anywhere to continue</div>
      </div>
    </div>
  );
}
