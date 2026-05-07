// Desktop wizard — Welcome with always-visible right guest rail.
//
// Task 7 collapsed the legacy stepper: StepShowing, StepSeats, and
// StepConfirm were deleted in favor of the canonical SeatPickSheet →
// PostPickSheet → DinnerPicker flow. Stepper steps 2 and 3 still
// resolve via SeatPickStepWrapper for /seats deep-link back-compat
// (Task 11 collapses that wrapper into the modal directly).
//
// Visual fidelity: 1fr/340px grid, stepper bar, navy ground, gold accents.

import { useEffect, useMemo, useState } from 'react';
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
import { useFinalize } from '../hooks/useFinalize.js';
import ConfirmationScreen from './ConfirmationScreen.jsx';
import MovieDetailSheet from './MovieDetailSheet.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import DinnerPicker from './components/DinnerPicker.jsx';
import { useDinnerCompleteness } from './components/useDinnerCompleteness.js';
import NightOfContent from './components/NightOfContent.jsx';
// Canonical seat-pick flow: SeatPickSheet → PostPickSheet asks "what
// next?" → AssignTheseSheet (batch delegation) or DinnerPicker (per-seat
// dinner). Mounted via Modal at the Desktop component level.
import SeatPickSheet from './components/SeatPickSheet.jsx';
import PostPickSheet from './components/PostPickSheet.jsx';
import AssignTheseSheet from './components/AssignTheseSheet.jsx';
import { useTheme } from '../hooks/useTheme.js';
import {
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
        background: isDark ? BRAND.groundDeep : 'var(--ground)',
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
  // Task 7 — dinner-warning chip now opens the canonical dinner picker
  // (the Modal at the Desktop component level scoped to seatIds via a
  // synthesized postPick) instead of routing through onReview to the
  // deleted legacy StepConfirm. Host wires this to
  // `openDinnerPickerForMissing` which builds the seatId list from
  // dinnerCompleteness.missingSeats.
  onSetDinners,
  // T3 v2 — canonical finalize wired through the secondary "Review &
  // finalize" CTA. When canFinalize is true (all entitled seats placed)
  // and dinners are complete, the button label flips to "Review &
  // finalize" and clicking fires the canonical /finalize via
  // useFinalize. Otherwise the label reflects what's still required:
  // "Place remaining seats" (re-opens SeatPickSheet) or, when seats are
  // all placed but dinners are missing, "Set dinners to finalize"
  // (disabled — sponsor sets dinners via the dinner-warning chip above,
  // which routes through onSetDinners to the canonical dinner picker).
  canFinalize,
  finalizing,
  finalizeError,
  onFinalize,
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
          <Btn kind="primary" size="lg" onClick={onNext} icon={<Icon name="arrowR" size={16} />} testId="cta-place-seats">
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
          finalized seats missing dinner picks. Tap opens the canonical
          DinnerPicker Modal scoped to the missing seats (Task 7
          rewire — replaces the legacy StepConfirm route via onReview).
          Falls back to onReview when onSetDinners isn't supplied so the
          component stays usable in any host that hasn't migrated. */}
      {dinnerMissing > 0 && (
        <button
          onClick={onSetDinners || onReview}
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
          secondary is the state-aware Review/Finalize CTA per T3 v2.
          Order matches mobile HomeTab's "Place" / "Edit" miniBtn pair. */}
      {/* T3 v2 — state-aware secondary CTA. Behavior depends on the
          sponsor's progress:
            - remaining > 0           → "Place remaining seats" (opens SeatPickSheet via onReview)
            - remaining === 0, !dinnerAllComplete → disabled "Set dinners to finalize"
            - remaining === 0, dinners complete   → "Review & finalize" → fires canonical finalize
          Disabling the all-placed-but-no-dinners state with a tooltip
          beats sending the sponsor back to seat-picking (the v1
          bug-feel). The dinner-warning chip above already gives them a
          first-class path to the dinner picker. */}
      {(() => {
        const dinnerAllComplete = !!dinnerCompleteness?.allComplete;
        const reviewReady = !!canFinalize && dinnerAllComplete;
        const dinnerGated = !!canFinalize && !dinnerAllComplete;
        let label = 'Review & finalize';
        let onClick = onReview;
        let disabled = false;
        let title = null;
        if (finalizing && reviewReady) {
          label = 'Sending your QR…';
          onClick = undefined;
          disabled = true;
        } else if (reviewReady) {
          label = 'Review & finalize';
          onClick = onFinalize || onReview;
        } else if (dinnerGated) {
          label = 'Set dinners to finalize';
          onClick = undefined;
          disabled = true;
          title = 'Pick dinner choices for every placed seat to enable finalize';
        } else {
          // remaining > 0 — keep the existing "open SeatPickSheet" path
          // through onReview. Sponsor still has placement work to do.
          label = 'Review & finalize';
          onClick = onReview;
        }
        return (
          <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
              <Btn kind="primary" size="lg" onClick={onEdit} icon={<Icon name="arrowR" size={16} />} testId="cta-place-seats">
                {remaining > 0 ? `Place ${remaining} more seat${remaining === 1 ? '' : 's'}` : 'Edit my placements'}
              </Btn>
              <Btn
                kind="secondary"
                size="lg"
                onClick={onClick}
                disabled={disabled}
                title={title || undefined}
                icon={<Icon name="arrowR" size={16} />}
                testId="cta-finalize"
              >
                {label}
              </Btn>
            </div>
            {finalizeError && reviewReady && (
              <div
                role="alert"
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid rgba(244,99,99,0.45)`,
                  background: 'rgba(244,99,99,0.10)',
                  color: '#ffb3b3',
                  fontSize: 12,
                  lineHeight: 1.5,
                  maxWidth: 520,
                }}
              >
                {String(finalizeError?.message || finalizeError)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ── SeatPickStepWrapper ───────────────────────────────────────────────
// Task 5 — replaces the legacy StepShowing/StepSeats renders for the
// wizard's case-2/case-3 paths. Mounts when the wizard reaches step 2
// or step 3 (e.g. via the `/sponsor/{token}/seats` deep-link which
// hands `initialStep={3}` from App.jsx) and immediately opens the
// canonical SeatPickSheet via the existing `<Modal open={seatPickOpen}>`
// at the bottom of Desktop. Closing the sheet without committing is
// handled by the modal's `onClose`, which returns the wizard to step 1.
//
// Empty deps are intentional: this is one-shot per-mount. Route changes
// land via Task 11's `openSheetOnMount` prop refactor, not here.
const SeatPickStepWrapper = ({ seatPickOpen, setSeatPickOpen }) => {
  useEffect(() => {
    if (!seatPickOpen) setSeatPickOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
      Opening seat picker…
    </div>
  );
};

// ── Adapter: portal API → Desktop data shape ──────────────────────────

const GALA_DATE = new Date(2026, 5, 10);
const daysOut = () => Math.max(0, Math.ceil((GALA_DATE - new Date()) / 86400000));

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

  const [step, setStep] = useState(initialStep);
  const remaining = blockSize - seats.totalAssigned;
  // T2 v2 — useFinalize provides confirmationData (consumed by the
  // ConfirmationScreen short-circuit below) plus finalize/finalizing
  // for the canonical PostPickSheet "Done" CTA. Replaces the prior
  // useState(null)/setConfirmationData pair the desktop root used to
  // own. PostPickSheet POSTs /finalize via this hook so the parity test
  // sees one wire-level flow.
  const {
    finalize,
    finalizing,
    error: finalizeError,
    clearError: clearFinalizeError,
    confirmationData,
    setConfirmationData,
  } = useFinalize({ apiBase, token, onRefresh });
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
  // SeatPickSheet (in Modal wrapper) is the canonical seat-pick surface
  // and chains to PostPickSheet → AssignTheseSheet / DinnerPicker. Stepper
  // cases 2/3 still mount SeatPickStepWrapper for /seats deep-link
  // back-compat (Task 11 collapses that to a direct prop).
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
  // T2 v2 — canonical finalize gate. Server contract is permissive
  // (only requires >= 1 placed seat; see functions/api/gala/portal/
  // [token]/finalize.js), so the UX gate is "all entitled seats
  // placed". Dinners are NOT part of the gate; sponsors pick them
  // later. PostPickSheet's "Done" CTA flips to "I'm done — send my
  // QR" when canFinalize is true.
  const canFinalize = placedCount >= (blockSize || 0) && (blockSize || 0) > 0;

  // Synthesize a "post-pick" payload of the placed seats currently
  // missing dinner choices, so the dinner-picker Modal — which scopes
  // to postPick.seatIds — can be opened from the Welcome chip even
  // though no fresh placement just happened. Mirrors what
  // SeatPickSheet's onCommitted produces minus the placement-only
  // metadata the Modal doesn't read.
  const openDinnerPickerForMissing = () => {
    const missing = dinnerCompleteness?.missingSeats || [];
    if (!missing.length) return;
    setPostPick({
      seatIds: missing.map((s) => `${s.row_label}-${s.seat_num}`),
    });
    setDinnerOpen(true);
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
              onSetDinners={openDinnerPickerForMissing}
              // T3 v2 — canonical finalize wired through Welcome's
              // secondary CTA. StepWelcome decides internally when
              // to call onFinalize (canFinalize && dinners complete)
              // vs falling back to onReview (placement work remains)
              // vs disabling the button (canFinalize but dinners
              // missing). Replaces the prior all-paths-to-setSeatPickOpen
              // fallback that recreated the bug-feel.
              canFinalize={canFinalize}
              finalizing={finalizing}
              finalizeError={finalizeError}
              onFinalize={async () => {
                try {
                  if (clearFinalizeError) clearFinalizeError();
                  await finalize();
                } catch (e) {
                  // useFinalize's hook already records the error in
                  // state; the inline alert below the CTA renders
                  // it. Swallow here so React doesn't unhandled-
                  // reject from a click handler.
                }
              }}
            />
          )}
          {step === 2 && (
            <SeatPickStepWrapper
              seatPickOpen={seatPickOpen}
              setSeatPickOpen={setSeatPickOpen}
            />
          )}
          {step === 3 && (
            <SeatPickStepWrapper
              seatPickOpen={seatPickOpen}
              setSeatPickOpen={setSeatPickOpen}
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
        onClose={() => {
          setSeatPickOpen(false);
          // Task 5 — when the sheet was opened by SeatPickStepWrapper
          // (wizard case-2/3, e.g. the `/seats` deep link), bounce back
          // to Welcome so the user doesn't see the wrapper's
          // "Opening seat picker…" placeholder.
          if (step === 2 || step === 3) setStep(1);
        }}
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
              // After a successful placement from case-2/3, return to
              // Welcome so PostPickSheet renders over the canonical
              // overview rather than over the wrapper placeholder.
              if (step === 2 || step === 3) setStep(1);
            }}
            onClose={() => {
              setSeatPickOpen(false);
              if (step === 2 || step === 3) setStep(1);
            }}
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
            missingDinnerCount={
              (portal?.myAssignments || [])
                .filter((a) =>
                  postPick.seatIds?.includes(`${a.row_label}-${a.seat_num}`)
                )
                .filter((a) => !a.dinner_choice).length
            }
            onAssign={() => setAssignThese(postPick)}
            onPickDinners={() => setDinnerOpen(true)}
            onDone={() => {
              setPostPick(null);
              setAssignThese(null);
              setDinnerOpen(false);
            }}
            canFinalize={canFinalize}
            onFinalize={async () => {
              try {
                await finalize();
                setPostPick(null);
                setAssignThese(null);
                setDinnerOpen(false);
              } catch {
                // useFinalize sets error state; modal stays open and
                // PostPickSheet renders the error banner.
              }
            }}
            finalizing={finalizing}
            error={finalizeError}
            onClearError={clearFinalizeError}
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
