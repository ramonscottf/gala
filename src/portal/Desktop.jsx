// Desktop wizard — Welcome → Showing → Seats → Confirm with always-visible
// right guest rail. Lifted from uploads/seating-chart/project/components/
// portal-flow-merged.jsx + portal-flows.jsx with these adaptations:
//
//  - Window globals → ES imports (BRAND, Btn, Icon, SectionEyebrow, Display
//    from src/brand; SeatMap/autoPickBlock/seatById/SeatLegend from
//    SeatEngine).
//  - SHOWTIMES + MOVIES constants → derived from portal.showtimes.
//  - useSeats hook → real-data wrapper (place() POSTs /pick per-seat).
//  - GuestRail is read-only for Phase 1: guests come from
//    myAssignments.guest_name dedup. Drag-drop seat→guest assignment
//    needs a per-seat guest mutation endpoint we haven't shipped; that's
//    Phase 2 along with inline guest add.
//  - PortalNav simplified — no internal nav links since the wizard owns
//    the route. Sponsor identity, days countdown, and tier badge ride on
//    the right.
//
// Visual fidelity: 1fr/340px grid, stepper bar, navy ground, gold accents.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND, FONT_DISPLAY, FONT_UI } from '../brand/tokens.js';
import {
  Btn,
  Icon,
  SectionEyebrow,
  Display,
  Logo,
  GalaWordmark,
  TierBadge,
} from '../brand/atoms.jsx';
import { SeatMap, SeatLegend, adaptTheater, seatById } from './SeatEngine.jsx';
import { otherTakenForTheater, checkBatchOrphans } from '../hooks/useSeats.js';
import { SHOWING_NUMBER_TO_ID, formatBadgeFor } from '../hooks/usePortal.js';
import ConfirmationScreen from './ConfirmationScreen.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import DinnerPicker from './components/DinnerPicker.jsx';
import { useDinnerCompleteness } from './components/useDinnerCompleteness.js';
import NightOfContent from './components/NightOfContent.jsx';
// Phase 1.15 — adopted PR #56 architecture for the seat-pick flow.
// SeatPickSheet replaces the legacy StepShowing+StepSeats stepper path
// when invoked from BRANCH B's Welcome CTAs. PostPickSheet asks "what
// next?" and AssignTheseSheet does multi-seat batch delegation.
import SeatPickSheet from './components/SeatPickSheet.jsx';
import PostPickSheet from './components/PostPickSheet.jsx';
import AssignTheseSheet from './components/AssignTheseSheet.jsx';
import { useTheme } from '../hooks/useTheme.js';
import {
  formatShowTime,
  DelegateForm,
  DelegateManage,
  DelegationStatusPill,
  adaptPortalToMobileData,
} from './Mobile.jsx';

// ── Avatar (deterministic palette from name) ──────────────────────────

const PALETTE = ['#a8b1ff', '#ff8da4', '#7fcfa0', '#f4b942', '#c9a3ff', '#ff9d6c'];
const colorFor = (name) => {
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
const Avatar = ({ name, size = 28 }) => {
  const initials = initialsFor(name);
  return (
    <span
      className="force-dark"
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: `linear-gradient(135deg, ${colorFor(name)}, ${BRAND.navyDeep})`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.38,
        letterSpacing: 0.2,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
};

const initialsFor = (name) => (name || '?')
  .split(/\s+/)
  .map((p) => p[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const PosterMini = ({ poster, color, label, size = 46 }) => (
  <div
    className="force-dark"
    style={{
      width: size,
      height: size * 1.4,
      borderRadius: 6,
      background: poster
        ? `url(${poster}) center/cover`
        : `linear-gradient(160deg, ${color || BRAND.navyMid}, ${BRAND.navyDeep})`,
      display: 'flex',
      alignItems: 'flex-end',
      padding: 4,
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}
  >
    {!poster && (
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontStyle: 'italic',
          fontSize: size * 0.22,
          color: 'rgba(255,255,255,0.9)',
          lineHeight: 1.05,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    )}
  </div>
);

const FormatBadge = ({ format, size = 'sm' }) => {
  const map = {
    IMAX: { bg: 'rgba(244,185,66,0.18)', c: BRAND.gold, border: 'rgba(244,185,66,0.4)' },
    Premier: { bg: 'rgba(212,38,74,0.16)', c: '#ff6b8a', border: 'rgba(212,38,74,0.4)' },
    Standard: { bg: 'rgba(255,255,255,0.06)', c: 'var(--mute)', border: BRAND.rule },
  };
  const s = map[format] || map.Standard;
  const pad = size === 'lg' ? '5px 12px' : '3px 8px';
  const fs = size === 'lg' ? 11 : 9;
  return (
    <span
      style={{
        padding: pad,
        borderRadius: 99,
        background: s.bg,
        color: s.c,
        border: `1px solid ${s.border}`,
        fontSize: fs,
        fontWeight: 800,
        letterSpacing: 1.4,
      }}
    >
      {format.toUpperCase()}
    </span>
  );
};

// ── PortalNav + PortalShell ───────────────────────────────────────────

const PortalNav = ({ name, subline, tier, daysOut, logoUrl, onSettingsTap, onNightTap }) => (
  <div
    className="page-header force-dark-vars"
    style={{
      height: 72,
      padding: '0 36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: `1px solid var(--rule)`,
      background: 'rgba(11,14,38,0.75)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      flexShrink: 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <Logo size={26} dark />
      <span style={{ width: 1, height: 24, background: BRAND.rule }} />
      <GalaWordmark size={11} />
      {logoUrl && (
        <>
          <span style={{ width: 1, height: 24, background: BRAND.rule }} />
          <img
            src={logoUrl}
            alt=""
            loading="lazy"
            style={{
              maxHeight: 28,
              maxWidth: 140,
              objectFit: 'contain',
              opacity: 0.9,
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {daysOut != null && (
        <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 700, letterSpacing: 1.4 }}>
          {daysOut} DAYS OUT
        </span>
      )}
      {/* M1 — Night of trigger. Mobile gets the dedicated NIGHT tab in
          its bottom tab bar; desktop wizard has no equivalent surface,
          so we expose the same content via a top-nav link → modal. */}
      {onNightTap && (
        <button
          onClick={onNightTap}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.78)',
            padding: '5px 10px',
            borderRadius: 99,
            border: `1px solid var(--rule)`,
            background: 'var(--surface)',
          }}
        >
          Night of
        </button>
      )}
      <span style={{ width: 1, height: 20, background: BRAND.rule }} />
      {tier && <TierBadge tier={tier} />}
      <button
        onClick={onSettingsTap}
        aria-label={`${initialsFor(name)} ${name || 'Sponsor'} settings`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '5px 14px 5px 5px',
          borderRadius: 999,
          background: 'var(--surface)',
          transition: 'background 0.15s',
          maxWidth: 360,
        }}
      >
        <Avatar name={name} size={28} />
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            lineHeight: 1.2,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name || subline}
          </span>
          {subline && name && subline !== name && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--mute)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subline}
            </span>
          )}
        </span>
      </button>
    </div>
  </div>
);

// ── Modal — desktop equivalent of Mobile.jsx's bottom-sheet wrapper ───
//
// Centered, max-width 560, all four corners rounded, padded from
// viewport edges so the content never bleeds. Used by D5 (Settings)
// and could be reused for any future modal-shaped sheet on desktop.

const Modal = ({ open, onClose, title, children, maxWidth = 560 }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scroll-container force-dark-vars"
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          background: BRAND.navyDeep,
          borderRadius: 22,
          overflow: 'auto',
          color: '#fff',
          fontFamily: FONT_UI,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          border: `1px solid var(--rule)`,
        }}
      >
        {title && (
          <div
            style={{
              padding: '20px 24px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid var(--rule)`,
              position: 'sticky',
              top: 0,
              background: BRAND.navyDeep,
              zIndex: 1,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600 }}>
              {title}
            </div>
            <button
              aria-label="Close dialog"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.08)',
                border: 0,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
};

const PortalShell = ({ children }) => {
  const { isDark } = useTheme();
  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        background: isDark
          ? BRAND.groundDeep
          : `radial-gradient(ellipse 120% 60% at 50% -10%, #fff 0%, #f7f8fb 60%)`,
        color: isDark ? '#fff' : BRAND.ink,
        fontFamily: FONT_UI,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
};

// ── Stepper ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Welcome' },
  { n: 2, label: 'Showing' },
  { n: 3, label: 'Seats' },
  { n: 4, label: 'Confirm' },
];

// Phase 1.10-patch — Stepper label for Step 1 flips to "Your tickets" once
// the sponsor has placed any seats, so the wizard reads as a return-to-overview
// affordance instead of a marketing intro after the first batch is placed.
const Stepper = ({ step, setStep, step1Label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    {STEPS.map((sBase, i) => {
      const s = sBase.n === 1 && step1Label ? { ...sBase, label: step1Label } : sBase;
      return (
      <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={() => setStep(s.n)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: s.n === step ? 1 : s.n < step ? 0.85 : 0.45,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 99,
              background: s.n <= step ? 'var(--accent-text-strong)' : 'transparent',
              border: s.n > step ? `1.5px solid rgba(255,255,255,0.3)` : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: s.n <= step ? '#fff' : '#fff',
            }}
          >
            {s.n < step ? <Icon name="check" size={12} /> : s.n}
          </div>
          <span style={{ fontSize: 12, fontWeight: s.n === step ? 700 : 500, letterSpacing: 0.4 }}>
            {s.label}
          </span>
        </button>
        {i < STEPS.length - 1 && (
          <span style={{ flex: '0 0 18px', height: 1, background: BRAND.rule }} />
        )}
      </div>
      );
    })}
  </div>
);

// ── Right Group rail (D6) ─────────────────────────────────────────────
//
// v1.5/1.6 shipped this as "Guest list" reading synthesized data from
// myAssignments.guest_name. Phase 1.6 B1 promoted childDelegations to
// the primary "Group" concept on mobile. Desktop catches up here.
//
// Rail structure mirrors mobile's GroupTab layout:
//  - GROUP eyebrow + "Your delegates." Fraunces serif accent on
//    "delegates" (indigo)
//  - Sub-line aggregates (X invited, Y of Z delegated seats placed,
//    K still yours to delegate)
//  - "+ Invite someone to seats" outline button → opens DelegateForm
//  - Cards: avatar, name, phone/email, "X of Y placed", DelegationStatusPill
//  - Tap a card → opens DelegateManage

const GroupRail = ({ delegations, seatMath, blockSize, onInvite, onOpenDelegation }) => {
  const totalAllocated = delegations.reduce((n, d) => n + (d.seatsAllocated || 0), 0);
  const totalPlaced = delegations.reduce((n, d) => n + (d.seatsPlaced || 0), 0);
  const available = seatMath?.available ?? Math.max(0, blockSize - totalAllocated);

  return (
    <div
      style={{
        borderLeft: `1px solid var(--rule)`,
        padding: '24px 22px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: 'rgba(0,0,0,0.22)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div>
        <SectionEyebrow>Group</SectionEyebrow>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 700,
            margin: '8px 0 6px',
            letterSpacing: -0.4,
            lineHeight: 1.05,
          }}
        >
          Your <i style={{ color: 'var(--accent-italic)', fontWeight: 500 }}>assignments.</i>
        </h2>
        <div style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
          {delegations.length} invited · {totalPlaced} of {totalAllocated} assigned seats
          placed
          {available > 0 && (
            <>
              <br />
              <span style={{ color: 'var(--accent-italic)' }}>
                {available} still yours to assign
              </span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={onInvite}
        disabled={available <= 0}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 10,
          border: `1.5px dashed ${available > 0 ? 'rgba(168,177,255,0.4)' : BRAND.rule}`,
          background: available > 0 ? 'rgba(168,177,255,0.06)' : 'transparent',
          color: available > 0 ? BRAND.indigoLight : 'var(--mute)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: available > 0 ? 'pointer' : 'not-allowed',
          fontFamily: FONT_UI,
        }}
      >
        <Icon name="plus" size={14} />{' '}
        {available > 0 ? 'Invite someone to seats' : 'No seats left to assign'}
      </button>

      <div
        className="scroll-container"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginRight: -6,
          paddingRight: 6,
        }}
      >
        {delegations.length === 0 && (
          <div
            style={{
              padding: '18px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: `1px dashed var(--rule)`,
              fontSize: 12,
              color: 'var(--mute)',
              fontStyle: 'italic',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            No one invited yet. Tap "Invite someone to seats" — we'll text + email them their
            own link to select seats.
          </div>
        )}
        {delegations.map((d) => (
          <button
            key={d.id}
            onClick={() => onOpenDelegation(d)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--surface)',
              border: `1px solid var(--rule)`,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <Avatar name={d.delegateName} size={32} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {d.delegateName}
              </div>
              {(d.phone || d.email) && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--mute)',
                    marginTop: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {d.phone || d.email}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--accent-italic)',
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {d.seatsPlaced} of {d.seatsAllocated} placed
              </div>
            </div>
            <DelegationStatusPill status={d.status} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Step 1: Welcome ───────────────────────────────────────────────────
//
// Phase 1.10-patch — context-aware StepWelcome.
//
// BRANCH A (placedCount === 0): unchanged marketing intro. The first
// time a sponsor lands on the wizard, they see the same 3-card "1.
// Showing · 2. Seats · 3. Confirm" copy + Begin CTA they always have.
//
// BRANCH B (placedCount > 0): "Your tickets" overview. Once any seat
// is placed, Step 1 becomes the desktop equivalent of mobile's HOME
// tab — a grouped list of tickets per showtime/auditorium with two
// CTAs (Edit my placements → Step 2; Review & finalize → Step 4).
//
// Why: on mobile the bottom tab bar gives one-tap access to a
// "your tickets" overview. Desktop has no such affordance — once a
// sponsor placed seats they had no obvious way back to a single-glance
// overview. Real-laptop demo caught this gap.

const StepWelcome = ({
  blockSize,
  tier,
  name,
  placedCount,
  tickets,
  daysOutNum,
  dinnerCompleteness,
  onNext,
  onEdit,
  onReview,
}) => {
  // BRANCH A — fresh sponsor, no seats placed yet. Identical render to
  // pre-Phase-1.10 wizard; preserves the marketing intro for first visit.
  if (!placedCount) {
    return (
      <div
        className="scroll-container"
        style={{ padding: '48px 56px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}
      >
        <SectionEyebrow>Step 1 of 4 · Welcome</SectionEyebrow>
        <Display size={56}>
          Place your <i style={{ color: 'var(--accent-italic)' }}>{blockSize} seats</i>
          <br />
          across the night.
        </Display>
        <p style={{ fontSize: 15, color: 'var(--mute)', lineHeight: 1.6, maxWidth: 520 }}>
          {name && `Hey ${name.split(' ')[0]} — `}your {tier || 'sponsor'} block can split across two
          showtimes and any of the films. Place them in batches; we'll keep your selections for you.
        </p>
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            maxWidth: 560,
          }}
        >
          {[
            { label: '1. Showing', copy: 'Select which auditorium and showtime to seat people in.' },
            { label: '2. Seats', copy: 'Drag-lasso a row, click individual seats, or auto-select a block.' },
            { label: '3. Confirm', copy: 'Review and place — you can come back to edit anytime.' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: 14,
                borderRadius: 10,
                border: `1px solid var(--rule)`,
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: 'var(--accent-text)' }}>
                {s.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 1.45 }}>
                {s.copy}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18 }}>
          <Btn kind="primary" size="lg" onClick={onNext} icon={<Icon name="arrowR" size={16} />}>
            Begin
          </Btn>
        </div>
      </div>
    );
  }

  // BRANCH B — sponsor has at least one placed seat. Mirror Mobile's
  // HomeTab "Your tickets" section (Mobile.jsx:553-682) at desktop scale.
  const remaining = Math.max(0, blockSize - placedCount);
  const dinnerMissing = dinnerCompleteness?.missingCount || 0;

  return (
    <div
      className="scroll-container"
      style={{ padding: '48px 56px 36px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 920 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionEyebrow>Welcome back</SectionEyebrow>
        {daysOutNum != null && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--mute)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 0.4,
            }}
          >
            {daysOutNum} days out
          </div>
        )}
      </div>
      <Display size={48}>
        Your night <i style={{ color: 'var(--accent-italic)' }}>at the gala.</i>
      </Display>
      <div style={{ fontSize: 14, color: 'var(--mute)', marginTop: -8 }}>
        Wednesday, June 10 · {placedCount} of {blockSize} seat{blockSize === 1 ? '' : 's'} placed
        {remaining > 0 ? ` · ${remaining} still to place` : ''}
      </div>

      {/* Optional dinner-warning chip — only renders when there are
          finalized seats missing dinner picks. Tap routes to Step 4
          where the DinnerPicker dropdowns live. */}
      {dinnerMissing > 0 && (
        <button
          onClick={onReview}
          style={{
            all: 'unset',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            padding: '10px 14px',
            borderRadius: 999,
            border: `1px solid rgba(244,185,66,0.35)`,
            background: 'rgba(244,185,66,0.08)',
            color: 'var(--accent-text)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.3,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="info" size={14} /> Set dinner for {dinnerMissing} more seat
          {dinnerMissing === 1 ? '' : 's'}
          <Icon name="arrowR" size={12} />
        </button>
      )}

      {/* Grouped ticket cards — one per theater. Two-column at desktop
          widths so 4-ticket sponsors fit above the fold. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 12,
        }}
      >
        {tickets.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 14,
              borderRadius: 14,
              background: 'var(--surface)',
              border: `1px solid var(--rule)`,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <PosterMini
              poster={t.posterUrl}
              color={BRAND.navyMid}
              label={t.movieShort}
              size={56}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                {t.showLabel && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      background: 'rgba(168,177,255,0.16)',
                      color: 'var(--accent-italic)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t.showLabel}
                  </span>
                )}
                {t.showTime && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#fff',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t.showTime}
                  </span>
                )}
                {t.status === 'pending' && (
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      background: 'rgba(244,185,66,0.18)',
                      color: 'var(--accent-text)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Held
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.movieTitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
                {t.theaterName} · {t.seats.length} seat{t.seats.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {t.seats.slice(0, 10).map((sid) => {
                  // Per-seat dinner indicator — green dot when picked,
                  // hollow dot when still missing. Only meaningful for
                  // claimed (finalized) rows; pending holds skip the
                  // marker since they can't carry dinner yet.
                  const row = t.assignmentRows?.find((r) => r.seat_id === sid);
                  const claimed = row?.status === 'claimed';
                  const hasDinner = !!row?.dinner_choice;
                  return (
                    <span
                      key={sid}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 700,
                        background: 'rgba(168,177,255,0.16)',
                        color: 'var(--accent-italic)',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: 0.3,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {sid.replace('-', '')}
                      {claimed && (
                        <span
                          aria-hidden
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 99,
                            background: hasDinner ? '#7fcfa0' : 'transparent',
                            border: hasDinner ? 'none' : `1px solid rgba(244,185,66,0.6)`,
                          }}
                        />
                      )}
                    </span>
                  );
                })}
                {t.seats.length > 10 && (
                  <span style={{ fontSize: 10, color: 'var(--mute)', alignSelf: 'center' }}>
                    +{t.seats.length - 10}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA row — gradient primary routes to picker (Step 2); ghost
          secondary jumps straight to review (Step 4). Order matches
          mobile HomeTab's "Place" / "Edit" miniBtn pair. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <Btn kind="primary" size="lg" onClick={onEdit} icon={<Icon name="arrowR" size={16} />}>
          {remaining > 0 ? `Place ${remaining} more seat${remaining === 1 ? '' : 's'}` : 'Edit my placements'}
        </Btn>
        <Btn kind="secondary" size="lg" onClick={onReview} icon={<Icon name="arrowR" size={16} />}>
          Review &amp; finalize
        </Btn>
      </div>
    </div>
  );
};

// ── Step 2: Showing picker ────────────────────────────────────────────

const StepShowing = ({
  showingsRich,
  showingNumber,
  setShowingNumber,
  moviesHere,
  movieId,
  setMovieId,
  theaterChoices,
  theaterId,
  setTheaterId,
  theatersById,
  onNext,
  onMovieDetail,
}) => (
  <div
    className="scroll-container"
    style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}
  >
    <div>
      <SectionEyebrow>Step 2 of 4 · Showing</SectionEyebrow>
      <Display size={42}>
        Where to <i style={{ color: 'var(--accent-italic)' }}>seat them?</i>
      </Display>
      <p style={{ fontSize: 14, color: 'var(--mute)', lineHeight: 1.55, marginTop: 6, maxWidth: 560 }}>
        Select the showtime and auditorium for this batch — each auditorium is showing one film.
      </p>
    </div>

    {/* D2 — showtime segmented pill. One container, two slots, BRAND.gradient
        on active. Pattern from gala-seats-app.html .picker__showtimes
        358-397 (same CSS Phase 1.7 F2 shipped on mobile). */}
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          color: 'var(--accent-text)',
          marginBottom: 10,
        }}
      >
        SHOWTIME
      </div>
      <div
        style={{
          display: 'inline-flex',
          gap: 0,
          border: `1.5px solid var(--rule)`,
          borderRadius: 12,
          padding: 3,
          background: 'var(--surface)',
        }}
      >
        {showingsRich.map((s) => {
          const active = showingNumber === s.number;
          return (
            <button
              key={s.number}
              onClick={() => setShowingNumber(s.number)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 24px',
                background: active ? BRAND.gradient : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                borderRadius: 9,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                minWidth: 220,
                boxShadow: active ? '0 4px 12px rgba(203,38,44,0.25)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 0.2,
                }}
              >
                {s.time || (s.number === 1 ? 'Early' : 'Late')}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: active ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.45)',
                  letterSpacing: 0.1,
                }}
              >
                {s.label}
                {s.dinnerTime ? ` · dinner ${s.dinnerTime}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>

    {/* D3 — rich movie cards. 96px poster panel left side, title+year,
        rating + runtime badges, "{N} aud · {N} seats" availability
        meta, "More about this movie →" affordance in BRAND.red opens
        MovieDetailSheet (D4). Pattern from gala-seats-app.html
        .picker__movie 400-470 + Phase 1.7 F3 mobile card. */}
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          color: 'var(--accent-text)',
          marginBottom: 10,
        }}
      >
        FILM
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
          maxWidth: 880,
        }}
      >
        {moviesHere.map((m) => {
          const active = movieId === m.id;
          return (
            <div
              key={m.id}
              style={{
                cursor: 'pointer',
                padding: 0,
                borderRadius: 14,
                border: `2px solid ${active ? BRAND.red : BRAND.rule}`,
                background: active
                  ? 'linear-gradient(135deg, rgba(215,40,70,0.10), rgba(215,40,70,0.02))'
                  : 'rgba(255,255,255,0.03)',
                boxShadow: active ? '0 6px 18px rgba(215,40,70,0.18)' : 'none',
                display: 'flex',
                gap: 0,
                overflow: 'hidden',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onClick={() => setMovieId(m.id)}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 96,
                  minHeight: 142,
                  background: m.posterUrl
                    ? `url(${m.posterUrl}) center/cover no-repeat`
                    : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
                }}
              />
              <div
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#fff',
                    lineHeight: 1.2,
                  }}
                >
                  {m.title}
                  {m.year ? (
                    <span style={{ color: 'var(--mute)', fontWeight: 500 }}> ({m.year})</span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.rating && (
                    <span
                      className="force-dark"
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: BRAND.ink,
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                      }}
                    >
                      {m.rating}
                    </span>
                  )}
                  {m.runtime && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {m.runtime} min
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--mute)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {m.audCount} aud{m.audCount === 1 ? '' : 's'} · {m.totalCapacity} seats
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMovieDetail?.(m);
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    color: BRAND.red,
                    marginTop: 'auto',
                    padding: '4px 0',
                  }}
                >
                  More about this movie →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {theaterChoices.length > 0 && (
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: 'var(--accent-text)',
            marginBottom: 10,
          }}
        >
          AUDITORIUM
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {theaterChoices.map((c) => {
            const active = theaterId === c.theaterId;
            return (
              <button
                key={c.theaterId}
                onClick={() => setTheaterId(c.theaterId)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${active ? 'var(--accent-text-strong)' : 'var(--rule)'}`,
                  background: active ? 'rgba(203,38,44,0.08)' : 'var(--surface)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <FormatBadge format={c.format} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {theatersById[c.theaterId]?.name || `Theater ${c.theaterId}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    )}

    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
      <Btn kind="primary" size="lg" onClick={onNext} icon={<Icon name="arrowR" size={16} />}>
        Select seats here
      </Btn>
    </div>
  </div>
);

// ── Step 3: Seats ─────────────────────────────────────────────────────

const StepSeats = ({
  adaptedTheater,
  movie,
  theaterMeta,
  theatersById,
  showingNumber,
  seats,
  sel,
  setSel,
  otherTaken,
  remaining,
  blockSize,
  onNext,
  // D9 — picker context propagated through so the user can change
  // showing/film/auditorium without backing out to Step 2.
  showingsRich,
  setShowingNumber,
  moviesHere,
  movieId,
  setMovieId,
  theaterChoices,
  setTheaterId,
  onMovieDetail,
}) => {
  const handleSelect = (ids, op) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (op === 'add') ids.forEach((id) => n.add(id));
      else ids.forEach((id) => n.delete(id));
      return n;
    });
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        minHeight: 0,
      }}
    >
      <div
        className="scroll-container"
        style={{
          borderRight: `1px solid var(--rule)`,
          padding: '24px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        <div>
          <SectionEyebrow>Step 3 of 4 · Seats</SectionEyebrow>
        </div>

        {/* D9 — compact showtime segmented pill in the rail. Same
            BRAND.gradient active state as the Step 2 pill, narrower. */}
        {showingsRich && showingsRich.length > 1 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: 'var(--accent-italic)',
                marginBottom: 6,
              }}
            >
              SHOWTIME
            </div>
            <div
              style={{
                display: 'flex',
                gap: 0,
                border: `1.5px solid var(--rule)`,
                borderRadius: 10,
                padding: 3,
                background: 'var(--surface)',
              }}
            >
              {showingsRich.map((s) => {
                const active = showingNumber === s.number;
                return (
                  <button
                    key={s.number}
                    onClick={() => setShowingNumber?.(s.number)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 7,
                      background: active ? BRAND.gradient : 'transparent',
                      color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                      fontSize: 12,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.2,
                      textAlign: 'center',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {s.time || (s.number === 1 ? 'Early' : 'Late')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* D9 — film list for the current showing. Tap to switch movies
            without leaving Step 3. Pattern from gala-seats-app.html
            "SWITCH SHOWING" panel. */}
        {moviesHere && moviesHere.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: 'var(--accent-italic)',
                marginBottom: 6,
              }}
            >
              FILM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {moviesHere.map((m) => {
                const active = movieId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMovieId?.(m.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${active ? BRAND.red : BRAND.rule}`,
                      background: active
                        ? 'linear-gradient(135deg, rgba(215,40,70,0.12), rgba(215,40,70,0.04))'
                        : 'rgba(255,255,255,0.03)',
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 50,
                        borderRadius: 4,
                        // H3 — D9's StepSeats film row is the desktop
                        // equivalent of the mobile movie pill: small
                        // filter chip, prefer the custom-cropped
                        // thumbnail.
                        background: m.thumbnailUrl || m.posterUrl
                          ? `url(${m.thumbnailUrl || m.posterUrl}) center/cover`
                          : `linear-gradient(160deg, ${BRAND.navyMid}, ${BRAND.navyDeep})`,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#fff',
                          lineHeight: 1.25,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--mute)',
                          marginTop: 2,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {m.rating} · {m.runtime}m · {m.audCount} aud
                        {m.audCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* D9 — auditorium chips for the current (showing × movie). When
            only one aud is available the chip is decorative; when 2+ the
            sponsor can swap chart context inline. */}
        {theaterChoices && theaterChoices.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: 'var(--accent-italic)',
                marginBottom: 6,
              }}
            >
              AUDITORIUM
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {theaterChoices.map((c) => {
                const active = theaterMeta?.theaterId === c.theaterId;
                return (
                  <button
                    key={c.theaterId}
                    onClick={() => setTheaterId?.(c.theaterId)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: `1.5px solid ${active ? BRAND.indigoLight : BRAND.rule}`,
                      background: active
                        ? 'rgba(168,177,255,0.10)'
                        : 'rgba(255,255,255,0.02)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#fff',
                    }}
                  >
                    <FormatBadge format={c.format} />
                    {theatersById[c.theaterId]?.name?.replace('Auditorium ', 'Aud ') ||
                      `Aud ${c.theaterId}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* "More about this movie" affordance — kept reachable from
            Step 3 so the user can deep-dive without going back. */}
        {movie && onMovieDetail && (
          <button
            onClick={() => onMovieDetail(movie)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: BRAND.red,
              padding: '4px 0',
            }}
          >
            More about this movie →
          </button>
        )}

        <div style={{ flex: 1 }} />

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--mute)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Selected here</span>
            <span style={{ color: 'var(--accent-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {sel.size}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Placed total</span>
            <span style={{ color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {seats.totalAssigned}/{blockSize}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Remaining</span>
            <span
              style={{
                color: remaining > 0 ? '#ff8da4' : '#7fcfa0',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {remaining}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {/* Phase 1.10-patch-2 Bug 2: primary "Done — review" gradient pill on top,
              secondary outline "Clear" pill below. Mirrors mobile's CTA pattern instead
              of the previous text-link styling that looked unclickable. */}
          <Btn
            kind="primary"
            size="md"
            onClick={onNext}
            disabled={sel.size === 0}
            full
            icon={<Icon name="arrowR" size={14} />}
          >
            Done — review
          </Btn>
          <Btn
            kind="secondary"
            size="sm"
            onClick={() => setSel(new Set())}
            disabled={sel.size === 0}
            full
          >
            Clear
          </Btn>
        </div>
      </div>

      <div
        style={{
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Display size={28}>Select seats — drag, click, or shift-range.</Display>
          <div style={{ fontSize: 11, color: 'var(--mute)', display: 'flex', gap: 14 }}>
            {[
              ['CLICK', 'one'],
              ['SHIFT+CLICK', 'range'],
              ['DRAG', 'box'],
            ].map(([k, v]) => (
              <span
                key={k}
                style={{
                  display: 'inline-flex',
                  gap: 5,
                  alignItems: 'center',
                  fontWeight: 600,
                  letterSpacing: 0.6,
                }}
              >
                <span
                  style={{
                    padding: '2px 6px',
                    border: `1px solid var(--rule)`,
                    borderRadius: 3,
                    color: '#fff',
                    fontSize: 9,
                  }}
                >
                  {k}
                </span>
                {v}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          }}
        >
          <div style={{ width: '100%', maxWidth: 880 }}>
            {adaptedTheater ? (
              <SeatMap
                theater={adaptedTheater}
                scale={22}
                assignedSelf={seats.allSelfIds}
                assignedOther={otherTaken}
                selected={sel}
                onSelect={handleSelect}
                showSeatNumbers={true}
                allowZoom
                allowLasso
              />
            ) : (
              <div style={{ color: 'var(--mute)', textAlign: 'center', padding: 32 }}>
                Select a showing and theater first.
              </div>
            )}
          </div>
        </div>
        <SeatLegend />
      </div>
    </div>
  );
};

// ── Step 4: Confirm ───────────────────────────────────────────────────

const StepConfirm = ({
  sel,
  adaptedTheater,
  movie,
  theaterMeta,
  theatersById,
  showingNumber,
  showingId,
  theaterId,
  seats,
  remaining,
  blockSize,
  onPlaced,
  onPrev,
  apiBase,
  token,
  onFinalized,
  // H1 — portal payload + onRefresh so the Mode B placed-seats list
  // can render DinnerPicker per claimed seat and bounce server state
  // back into local on a successful set_dinner POST.
  portal,
  onRefresh,
}) => {
  const [placing, setPlacing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [err, setErr] = useState(null);

  const place = async () => {
    // Pre-flight: see SeatPickSheet for the rationale. Same check as the
    // mobile sheet so Desktop sponsors get the same friendly error.
    const seatIds = [...sel];
    const orphanCheck = checkBatchOrphans(portal, theaterId, seatIds);
    if (!orphanCheck.ok) {
      setErr(new Error(
        `That selection would leave seat ${orphanCheck.orphan} alone in row ${orphanCheck.row}. Please choose a different seat so no single seat is left empty.`
      ));
      return;
    }

    setPlacing(true);
    setErr(null);
    try {
      await seats.place(showingId, theaterId, seatIds);
      onPlaced();
    } catch (e) {
      setErr(e);
    } finally {
      setPlacing(false);
    }
  };

  // D1 — finalize the entire RSVP (not just this batch). Mirrors mobile
  // F1: POST /finalize, capture {seatCount, qrImgUrl, email/sms.sent},
  // hand it back to the Desktop root which short-circuits to
  // ConfirmationScreen. The /finalize endpoint flips rsvp_status to
  // 'completed' and sends the QR via Twilio + email — seats stay
  // editable until June 9.
  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}/api/gala/portal/${token}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onFinalized(data);
    } catch (e) {
      setErr(e);
    } finally {
      setFinalizing(false);
    }
  };

  const hasPlacedSeats = seats.totalAssigned > 0;
  const hasPendingBatch = sel.size > 0;
  // H2 — gate Done on dinner completeness (Mode B only; Mode A's
  // Place button doesn't care about dinner since the seat hasn't
  // even been finalized yet).
  const dinner = useDinnerCompleteness(portal?.myAssignments);

  // H1 — group myAssignments by theater for the Mode B placed-seats
  // list. Mirrors MobileWizard Step4Review's `grouped` shape so both
  // shells render the same per-seat dinner-picker grid.
  const placedGroups = useMemo(() => {
    if (hasPendingBatch || !hasPlacedSeats) return [];
    const myAssignments = portal?.myAssignments || [];
    const showtimes = portal?.showtimes || [];
    const showtimeByTheater = {};
    showtimes.forEach((s) => {
      if (!showtimeByTheater[s.theater_id]) showtimeByTheater[s.theater_id] = s;
    });
    const m = new Map();
    myAssignments.forEach((row) => {
      const key = row.theater_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({
        seat_id: `${row.row_label}-${row.seat_num}`,
        theater_id: row.theater_id,
        row_label: row.row_label,
        seat_num: row.seat_num,
        dinner_choice: row.dinner_choice || null,
        status: 'claimed',
      });
    });
    return [...m.entries()].map(([tid, assignments]) => {
      const st = showtimeByTheater[tid];
      const theater = theatersById[tid];
      return {
        key: tid,
        showLabel:
          st?.showing_number === 1 ? 'Early' : st?.showing_number === 2 ? 'Late' : '',
        showTime: formatShowTime(st?.show_start),
        movieTitle: st?.movie_title || '',
        theaterName: theater?.name || `Theater ${tid}`,
        format: formatBadgeFor(st?.theater_tier, st?.theater_notes),
        assignments: [...assignments].sort((a, b) =>
          a.seat_id.localeCompare(b.seat_id)
        ),
      };
    });
  }, [portal, theatersById, hasPendingBatch, hasPlacedSeats]);

  return (
    <div
      className="scroll-container"
      style={{ padding: '40px 56px', display: 'flex', flexDirection: 'column', gap: 22 }}
    >
      <SectionEyebrow>Step 4 of 4 · Confirm</SectionEyebrow>
      <Display size={48}>
        {hasPendingBatch ? (
          <>
            Lock in <i style={{ color: 'var(--accent-italic)' }}>{sel.size} seat{sel.size === 1 ? '' : 's'}?</i>
          </>
        ) : (
          <>
            Send your <i style={{ color: 'var(--accent-italic)' }}>QR.</i>
          </>
        )}
      </Display>
      <p style={{ fontSize: 14, color: 'var(--mute)', lineHeight: 1.55, maxWidth: 560 }}>
        {hasPendingBatch ? (
          <>
            {sel.size} seats in {theatersById[theaterMeta?.theaterId]?.name} for the{' '}
            {showingNumber === 1 ? 'early' : 'late'} showing of <b>{movie?.title}</b>. You'll have{' '}
            <b style={{ color: '#fff' }}>{remaining - sel.size}</b> seats left to place after this.
          </>
        ) : (
          <>
            {seats.totalAssigned} of {blockSize} seats placed. Tap{' '}
            <b style={{ color: '#fff' }}>Done — send me my QR</b> to finalize and we'll text +
            email your check-in code. Seats stay editable until June 9.
          </>
        )}
      </p>

      {hasPendingBatch && (
        <div
          style={{
            padding: 18,
            borderRadius: 14,
            border: `1px solid var(--rule)`,
            background: 'var(--surface)',
            maxWidth: 720,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...sel].sort().map((id) => {
              const s = adaptedTheater ? seatById(adaptedTheater, id) : null;
              return (
                <span
                  key={id}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 5,
                    background: 'rgba(168,177,255,0.18)',
                    color: 'var(--accent-italic)',
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    display: 'inline-flex',
                    gap: 5,
                    alignItems: 'center',
                  }}
                >
                  {id.replace('-', '')}
                  {s && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 1.5,
                        background: BRAND.ink,
                        opacity: 0.4,
                      }}
                      title={s.t}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* H1 — Mode B (no pending batch + has placed seats) renders
          the full placed-seats roster with DinnerPicker per claimed
          seat. Mobile Step4Review has the same layout; the desktop
          version uses a wider grid so two seats fit per row at 1280px+. */}
      {!hasPendingBatch && hasPlacedSeats && placedGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 }}>
          {placedGroups.map((g) => (
            <div
              key={g.key}
              style={{
                padding: 18,
                borderRadius: 14,
                border: `1px solid var(--rule)`,
                background: 'var(--surface)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1.4,
                    color: 'var(--accent-text)',
                  }}
                >
                  {g.showLabel.toUpperCase()} ·{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{g.showTime}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                  {g.movieTitle}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--mute)',
                    marginLeft: 'auto',
                  }}
                >
                  {g.theaterName} · <FormatBadge format={g.format} /> ·{' '}
                  {g.assignments.length} seat
                  {g.assignments.length === 1 ? '' : 's'}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {g.assignments.map((a) => (
                  <div
                    key={a.seat_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: 'rgba(168,177,255,0.18)',
                        color: 'var(--accent-italic)',
                        fontSize: 11,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 38,
                        textAlign: 'center',
                      }}
                    >
                      {a.seat_id.replace('-', '')}
                    </span>
                    <DinnerPicker
                      assignment={a}
                      token={token}
                      apiBase={apiBase}
                      size="sm"
                      onChange={onRefresh ? () => onRefresh() : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(212,38,74,0.12)',
            border: `1px solid rgba(212,38,74,0.4)`,
            color: '#ff8da4',
            fontSize: 13,
            maxWidth: 720,
          }}
        >
          {err.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <Btn kind="secondary" size="lg" onClick={onPrev}>
          Back to map
        </Btn>
        {hasPendingBatch && (
          <Btn
            kind="primary"
            size="lg"
            onClick={place}
            disabled={placing || sel.size === 0}
            icon={<Icon name="check" size={16} />}
          >
            {placing ? 'Placing…' : `Place ${sel.size} seat${sel.size === 1 ? '' : 's'}`}
          </Btn>
        )}
        {hasPlacedSeats && !hasPendingBatch && (
          <Btn
            kind="primary"
            size="lg"
            onClick={finalize}
            disabled={finalizing || !dinner.allComplete}
            icon={<Icon name="check" size={16} />}
          >
            {finalizing
              ? 'Sending your QR…'
              : dinner.allComplete
                ? 'Done — send me my QR'
                : `Select dinner for ${dinner.missingCount} more seat${dinner.missingCount === 1 ? '' : 's'}`}
          </Btn>
        )}
      </div>
    </div>
  );
};

// ── Adapter: portal API → Desktop data shape ──────────────────────────

const GALA_DATE = new Date(2026, 5, 10);
const daysOut = () => Math.max(0, Math.ceil((GALA_DATE - new Date()) / 86400000));

function buildContext(portal, theaterLayouts) {
  const showtimes = portal?.showtimes || [];
  const showings = [...new Set(showtimes.map((s) => s.showing_number))].sort();

  // D2 — rich showing data for the segmented pill: time + dinner time
  // pulled from the earliest-start row per showing_number. Mirrors
  // MobileWizard's showingsRich pattern.
  const showingsRichMap = new Map();
  showtimes.forEach((s) => {
    const existing = showingsRichMap.get(s.showing_number);
    if (!existing || (s.show_start && s.show_start < existing.show_start)) {
      showingsRichMap.set(s.showing_number, s);
    }
  });
  const showingsRich = [...showingsRichMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([n, s]) => ({
      number: n,
      label: n === 1 ? 'Early showing' : n === 2 ? 'Late showing' : `Show ${n}`,
      time: formatShowTime(s.show_start),
      dinnerTime: formatShowTime(s.dinner_time),
    }));

  // D3 + D4 — moviesByShowing carries the rich-card payload (poster +
  // metadata aggregates + MovieDetailSheet inputs). theaterIds /
  // totalCapacity drive the "1 aud · 94 seats" meta line; backdropUrl /
  // trailerUrl / streamUid / synopsis / year are read by MovieDetailSheet.
  const moviesByShowing = {};
  showtimes.forEach((s) => {
    if (!moviesByShowing[s.showing_number]) moviesByShowing[s.showing_number] = new Map();
    if (!moviesByShowing[s.showing_number].has(s.movie_id)) {
      moviesByShowing[s.showing_number].set(s.movie_id, {
        id: s.movie_id,
        title: s.movie_title,
        short: s.movie_title?.split(' ')[0] || '',
        posterUrl: s.poster_url,
        // H3 — thumbnail_url is the custom-cropped PNG used by small
        // filter chips (24×24 movie pill, 36×50 desktop film row);
        // poster_url is the canonical TMDB image used by rich cards
        // and MovieDetailSheet hero.
        thumbnailUrl: s.thumbnail_url,
        backdropUrl: s.backdrop_url,
        trailerUrl: s.trailer_url,
        streamUid: s.stream_uid,
        synopsis: s.synopsis,
        year: s.year,
        rating: s.rating,
        runtime: s.runtime_minutes,
        theaterIds: new Set([s.theater_id]),
        totalCapacity: s.capacity || 0,
      });
    } else {
      const entry = moviesByShowing[s.showing_number].get(s.movie_id);
      entry.theaterIds.add(s.theater_id);
      entry.totalCapacity += s.capacity || 0;
    }
  });
  Object.keys(moviesByShowing).forEach((k) => {
    moviesByShowing[k] = [...moviesByShowing[k].values()].map((e) => ({
      ...e,
      audCount: e.theaterIds.size,
    }));
  });

  const theatersForCombo = {};
  showtimes.forEach((s) => {
    const k = `${s.showing_number}|${s.movie_id}`;
    if (!theatersForCombo[k]) theatersForCombo[k] = [];
    theatersForCombo[k].push({
      theaterId: s.theater_id,
      format: formatBadgeFor(s.theater_tier, s.theater_notes),
    });
  });

  const theatersById = {};
  (theaterLayouts?.theaters || []).forEach((t) => {
    theatersById[t.id] = t;
  });

  return { showings, showingsRich, moviesByShowing, theatersForCombo, theatersById };
}

// ── DEV banner ────────────────────────────────────────────────────────

const DevBanner = () => (
  <div
    style={{
      flexShrink: 0,
      padding: '4px 14px',
      background: BRAND.gold,
      color: BRAND.ink,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: 1.6,
      textAlign: 'center',
    }}
  >
    DEV PORTAL · NOT FOR SPONSORS · /GALA-DEV/(TOKEN)
  </div>
);

// ── Desktop root ──────────────────────────────────────────────────────

export default function Desktop({
  portal,
  token,
  theaterLayouts,
  seats,
  isDev,
  initialStep = 1,
  apiBase = '',
  onRefresh,
}) {
  const navigate = useNavigate();
  const id = portal?.identity || {};
  const isDelegation = id.kind === 'delegation';
  const tier = id.tier || id.parentTier;
  const name = id.contactName || id.delegateName || '';
  const company = id.company || id.parentCompany || '';
  const logoUrl = id.logoUrl || id.parentLogoUrl || null;
  const blockSize = id.seatsPurchased || id.seatsAllocated || 0;
  // D8 — delegates see "{Parent company} invited you to N seats" instead
  // of just the company name, so they immediately understand who pulled
  // them in and for how many. Mirrors Mobile.jsx adapter.subline pattern.
  const subline = isDelegation
    ? `${company} invited you to ${blockSize} seat${blockSize === 1 ? '' : 's'}`
    : company;

  const ctx = useMemo(() => buildContext(portal, theaterLayouts), [portal, theaterLayouts]);
  const [step, setStep] = useState(initialStep);
  const [showingNumber, setShowingNumber] = useState(ctx.showings[0] || 1);
  const moviesHere = ctx.moviesByShowing[showingNumber] || [];
  const [movieId, setMovieId] = useState(moviesHere[0]?.id);
  useEffect(() => {
    const list = ctx.moviesByShowing[showingNumber] || [];
    if (!list.find((m) => m.id === movieId)) setMovieId(list[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingNumber, ctx.moviesByShowing]);

  const theaterChoices = ctx.theatersForCombo[`${showingNumber}|${movieId}`] || [];
  const [theaterId, setTheaterId] = useState(theaterChoices[0]?.theaterId);
  useEffect(() => {
    const list = ctx.theatersForCombo[`${showingNumber}|${movieId}`] || [];
    if (!list.find((t) => t.theaterId === theaterId)) setTheaterId(list[0]?.theaterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingNumber, movieId, ctx.theatersForCombo]);

  const adaptedTheater = useMemo(
    () => (theaterId ? adaptTheater(ctx.theatersById[theaterId]) : null),
    [theaterId, ctx.theatersById]
  );
  const otherTaken = useMemo(
    () => (theaterId ? otherTakenForTheater(portal, theaterId) : new Set()),
    [portal, theaterId]
  );
  const movie = moviesHere.find((m) => m.id === movieId);
  const theaterMeta = theaterChoices.find((t) => t.theaterId === theaterId);

  const [sel, setSel] = useState(new Set());
  const remaining = blockSize - seats.totalAssigned;
  // D1: confirmation short-circuit — when /finalize succeeds StepConfirm
  // sets this state and Desktop early-returns the shared
  // ConfirmationScreen instead of the wizard chrome.
  const [confirmationData, setConfirmationData] = useState(null);
  // D4: MovieDetailSheet open state — augmented with __showLabel /
  // __showTime / __showingNumber so the sheet can render the
  // "Show 4:30 PM · Early showing" badge per F4 mobile pattern.
  const [movieDetail, setMovieDetail] = useState(null);
  // D5: Settings modal — opens from the avatar/name chip in PortalNav.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // D6: Group rail — invite + manage modals (DelegateForm + DelegateManage
  // imported from Mobile.jsx, wrapped in the desktop Modal).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [delegationSheet, setDelegationSheet] = useState(null);
  // M1 — Night of modal. Mobile has the dedicated NIGHT tab; desktop
  // surfaces the same NightOfContent via a top-nav button.
  const [nightOpen, setNightOpen] = useState(false);
  // Phase 1.15 — adopted PR #56 architecture. SeatPickSheet (in Modal
  // wrapper) is the canonical seat-pick surface; chains to PostPickSheet
  // → AssignTheseSheet / DinnerPicker. The legacy stepper still resolves
  // for back-compat (StepWelcome → setStep(2) on the legacy path), but
  // BRANCH B's primary CTAs now open SeatPickSheet directly.
  const [seatPickOpen, setSeatPickOpen] = useState(false);
  const [postPick, setPostPick] = useState(null);
  const [assignThese, setAssignThese] = useState(null);
  const [dinnerOpen, setDinnerOpen] = useState(false);

  // D6 — delegations come straight from the API (Phase 1.6 B1 shape).
  // Synthesized guest_name list from v1.5 is gone; the rail now reads
  // childDelegations directly so what users see lines up with the
  // /delegate Twilio invite flow.
  const delegations = portal?.childDelegations || [];

  // Phase 1.10-patch — grouped tickets for the smart Welcome step's
  // BRANCH B "Your tickets" overview. Reuses the same adapter that
  // Mobile.jsx HomeTab consumes so both shells render the same data.
  const mobileData = useMemo(
    () => adaptPortalToMobileData(portal, theaterLayouts),
    [portal, theaterLayouts]
  );
  const tickets = mobileData?.tickets || [];
  const dinnerCompleteness = useDinnerCompleteness(portal?.myAssignments);
  const placedCount = seats.totalAssigned;

  const onPlaced = () => {
    setSel(new Set());
    setStep(2);
    navigate('');
  };

  if (confirmationData) {
    return (
      <ConfirmationScreen
        name={name}
        data={confirmationData}
        isDev={isDev}
        logoUrl={logoUrl}
        onEdit={() => {
          setConfirmationData(null);
          if (onRefresh) onRefresh();
        }}
      />
    );
  }

  return (
    <PortalShell>
      {isDev && <DevBanner />}
      <PortalNav
        name={name}
        subline={subline}
        tier={tier}
        daysOut={daysOut()}
        logoUrl={logoUrl}
        onSettingsTap={() => setSettingsOpen(true)}
        onNightTap={() => setNightOpen(true)}
      />

      <div
        className="wizard-body"
        style={{
          padding: '16px 36px',
          borderBottom: `1px solid var(--rule)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Stepper
          step={step}
          setStep={setStep}
          step1Label={placedCount > 0 ? 'Your tickets' : undefined}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 12,
            color: 'var(--mute)',
          }}
        >
          <span>
            <b style={{ color: '#fff' }}>{seats.totalAssigned}</b> / {blockSize} placed
          </span>
          <span>·</span>
          <span>
            <b style={{ color: remaining > 0 ? 'var(--accent-text-strong)' : '#7fcfa0' }}>{remaining}</b> remaining
          </span>
        </div>
      </div>

      {/* D8 — delegate tokens hide the GroupRail (delegates can't sub-
          delegate from v1.7 UI even though delegate.js endpoint
          supports it; mirrors mobile hiding the Group tab). Wizard
          fills full width when the rail is suppressed. */}
      <div
        className="wizard-body"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: isDelegation ? '1fr' : '1fr 340px',
          minHeight: 0,
        }}
      >
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {step === 1 && (
            <StepWelcome
              blockSize={blockSize}
              tier={tier}
              name={name}
              placedCount={placedCount}
              tickets={tickets}
              daysOutNum={daysOut()}
              dinnerCompleteness={dinnerCompleteness}
              onNext={() => setSeatPickOpen(true)}
              onEdit={() => setSeatPickOpen(true)}
              onReview={() => setSeatPickOpen(true)}
            />
          )}
          {step === 2 && (
            <StepShowing
              showingsRich={ctx.showingsRich}
              showingNumber={showingNumber}
              setShowingNumber={setShowingNumber}
              moviesHere={moviesHere}
              movieId={movieId}
              setMovieId={setMovieId}
              theaterChoices={theaterChoices}
              theaterId={theaterId}
              setTheaterId={setTheaterId}
              theatersById={ctx.theatersById}
              onNext={() => setStep(3)}
              onMovieDetail={(m) => {
                const ctxShowing = ctx.showingsRich.find((sr) => sr.number === showingNumber);
                setMovieDetail({
                  ...m,
                  __showingNumber: showingNumber,
                  __showLabel: ctxShowing?.label,
                  __showTime: ctxShowing?.time,
                });
              }}
            />
          )}
          {step === 3 && (
            <StepSeats
              adaptedTheater={adaptedTheater}
              movie={movie}
              theaterMeta={theaterMeta}
              theatersById={ctx.theatersById}
              showingNumber={showingNumber}
              seats={seats}
              sel={sel}
              setSel={setSel}
              otherTaken={otherTaken}
              remaining={remaining}
              blockSize={blockSize}
              onNext={() => setStep(4)}
              showingsRich={ctx.showingsRich}
              setShowingNumber={setShowingNumber}
              moviesHere={moviesHere}
              movieId={movieId}
              setMovieId={setMovieId}
              theaterChoices={theaterChoices}
              setTheaterId={setTheaterId}
              onMovieDetail={(m) => {
                const ctxShowing = ctx.showingsRich.find((sr) => sr.number === showingNumber);
                setMovieDetail({
                  ...m,
                  __showingNumber: showingNumber,
                  __showLabel: ctxShowing?.label,
                  __showTime: ctxShowing?.time,
                });
              }}
            />
          )}
          {step === 4 && (
            <StepConfirm
              sel={sel}
              adaptedTheater={adaptedTheater}
              movie={movie}
              theaterMeta={theaterMeta}
              theatersById={ctx.theatersById}
              showingNumber={showingNumber}
              showingId={SHOWING_NUMBER_TO_ID[showingNumber]}
              theaterId={theaterId}
              seats={seats}
              remaining={remaining}
              blockSize={blockSize}
              onPlaced={onPlaced}
              onPrev={() => setStep(3)}
              apiBase={apiBase}
              token={token}
              onFinalized={(data) => setConfirmationData(data)}
              portal={portal}
              onRefresh={onRefresh}
            />
          )}
        </div>
        {!isDelegation && (
          <GroupRail
            delegations={delegations}
            seatMath={portal?.seatMath}
            blockSize={blockSize}
            onInvite={() => setInviteOpen(true)}
            onOpenDelegation={(d) => setDelegationSheet(d)}
          />
        )}
      </div>

      {movieDetail && (
        <MovieDetailSheet
          movie={movieDetail}
          showLabel={
            movieDetail.__showLabel ||
            (movieDetail.__showingNumber === 1
              ? 'Early showing'
              : movieDetail.__showingNumber === 2
                ? 'Late showing'
                : '')
          }
          showTime={movieDetail.__showTime}
          variant="modal"
          onClose={() => setMovieDetail(null)}
        />
      )}

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <SettingsSheet
          identity={portal?.identity}
          isDelegation={isDelegation}
          token={token}
          apiBase={apiBase}
          onClose={() => setSettingsOpen(false)}
          onSaved={onRefresh}
        />
      </Modal>

      {!isDelegation && (
        <Modal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title="Invite to seats"
        >
          <DelegateForm
            token={token}
            apiBase={apiBase}
            available={portal?.seatMath?.available ?? 0}
            onCreated={onRefresh || (() => Promise.resolve())}
            onClose={() => setInviteOpen(false)}
          />
        </Modal>
      )}

      <Modal
        open={!!delegationSheet}
        onClose={() => setDelegationSheet(null)}
        title="Manage invite"
      >
        {delegationSheet && (
          <DelegateManage
            delegation={delegationSheet}
            token={token}
            apiBase={apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={() => setDelegationSheet(null)}
          />
        )}
      </Modal>

      <Modal
        open={nightOpen}
        onClose={() => setNightOpen(false)}
        title="The night · what to expect"
        maxWidth={680}
      >
        <NightOfContent compact />
      </Modal>

      {/* Phase 1.15 — sheet flow adopted from PR #56. SeatPickSheet
          opens as a centered modal; PostPick + AssignThese chain off
          its onCommitted handoff. The stepper stays available for
          back-compat with email deep links. */}
      <Modal
        open={seatPickOpen}
        onClose={() => setSeatPickOpen(false)}
        title="Place seats"
        maxWidth={760}
      >
        {seatPickOpen && (
          <SeatPickSheet
            variant="modal"
            portal={portal}
            theaterLayouts={theaterLayouts}
            seats={seats}
            blockSize={blockSize}
            token={token}
            apiBase={apiBase}
            onRefresh={onRefresh}
            onMovieDetail={(m) => setMovieDetail(m)}
            onCommitted={(placed) => {
              setSeatPickOpen(false);
              setPostPick(placed);
            }}
            onClose={() => setSeatPickOpen(false)}
          />
        )}
      </Modal>

      <Modal
        open={!!postPick}
        onClose={() => setPostPick(null)}
        title="Seats placed"
        maxWidth={520}
      >
        {postPick && (
          <PostPickSheet
            placed={postPick}
            missingDinnerCount={postPick.seatIds?.length || 0}
            onAssign={() => setAssignThese(postPick)}
            onPickDinners={() => setDinnerOpen(true)}
            onDone={() => {
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!assignThese}
        onClose={() => setAssignThese(null)}
        title="Assign seats"
        maxWidth={560}
      >
        {assignThese && (
          <AssignTheseSheet
            placed={assignThese}
            delegations={delegations}
            token={token}
            apiBase={apiBase}
            onSaved={async () => {
              if (onRefresh) await onRefresh();
              setAssignThese(null);
              setPostPick(null);
            }}
            onSkip={() => setAssignThese(null)}
            onInviteNew={() => {
              setAssignThese(null);
              setInviteOpen(true);
            }}
          />
        )}
      </Modal>

      <Modal
        open={dinnerOpen}
        onClose={() => setDinnerOpen(false)}
        title="Pick dinners"
        maxWidth={520}
      >
        {dinnerOpen && postPick && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>
              Choose a meal for each seat you just placed.
            </div>
            {(portal?.myAssignments || [])
              .filter((r) => postPick.seatIds?.includes(`${r.row_label}-${r.seat_num}`))
              .map((r) => (
                <div
                  key={`${r.theater_id}-${r.row_label}-${r.seat_num}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid var(--rule)`,
                    background: 'var(--surface)',
                  }}
                >
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: 'rgba(168,177,255,0.18)',
                      color: BRAND.indigoLight,
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 44,
                      textAlign: 'center',
                    }}
                  >
                    {r.row_label}
                    {r.seat_num}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <DinnerPicker
                      assignment={r}
                      token={token}
                      apiBase={apiBase}
                      onChange={() => {
                        if (onRefresh) onRefresh();
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
