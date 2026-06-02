import React, { useState, useEffect } from 'react';
import { loadMarketingPipeline, sendCatchUp } from './api.js';

// Composer modal — opens from the sponsor card's "Compose email" /
// "Compose text" buttons. Two modes:
//
//   1. "Custom message" (default) — type a one-off email or text.
//      Identical to v1 behavior. Fires through the existing
//      sendMessage() API (admin/sponsor-message endpoint).
//
//   2. "Resend a marketing piece" (Phase 5.16, 2026-05-12) —
//      list every marketing touchpoint that's already been
//      fired to its audience, with a "Send to this sponsor"
//      button per row that replays the exact email (live copy
//      from marketing_sends, sponsor's rsvp_token + first name,
//      no test banner). Used when a sponsor joins or changes
//      tier after a marketing wave has already gone out.
//      Email-only by default with an SMS toggle that's
//      currently disabled (sponsors don't carry SMS opt-in
//      flags yet — see /api/gala/marketing-catch-up-send for
//      the preflight that enforces this).
//
// The replay tab only appears in email mode — texting custom
// SMS preserves the old single-mode UI.

export function Composer({ sponsor, channel, onClose, onSend, onCatchUpSent }) {
  const [mode, setMode] = useState('custom'); // 'custom' | 'replay'
  const [subject, setSubject] = useState(`Davis Education Foundation Gala — ${sponsor.company}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (channel === 'email') {
      const first = sponsor.first_name || 'there';
      setBody(
        `Hi ${first},\n\n` +
        `Just following up on the DEF Gala — let me know if you have any questions about your sponsorship or seat selections.\n\n` +
        `— Sherry Miggin\n  Davis Education Foundation`
      );
    } else {
      const first = sponsor.first_name || 'there';
      setBody(`Hi ${first}, this is the Davis Education Foundation. Quick check-in on your DEF Gala seats — any questions?`);
    }
  }, [channel, sponsor]);

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(channel, body, channel === 'email' ? subject : undefined);
    } finally {
      setSending(false);
    }
  };

  const recipient = channel === 'email' ? sponsor.email : sponsor.phone;
  const charCount = body.length;
  const smsLimit = 160;
  const smsSegments = channel === 'sms' ? Math.ceil(charCount / smsLimit) || 1 : 0;

  return (
    <div className="gs-modal-bg" onClick={onClose}>
      <div className="gs-modal" onClick={e => e.stopPropagation()}>
        <div className="gs-modal-h">
          <div className="gs-modal-title">
            {channel === 'email' ? '📧 Send email' : '📱 Send text'} — {sponsor.company}
          </div>
          <button className="gs-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Mode tabs — both channels. SMS now has a catch-up (resend) tab too. */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 14,
            borderBottom: '1px solid var(--def-border)',
          }}
        >
          <ModeTab
            active={mode === 'custom'}
            onClick={() => setMode('custom')}
            label="✏️ Custom message"
          />
          <ModeTab
            active={mode === 'replay'}
            onClick={() => setMode('replay')}
            label={channel === 'sms' ? '📨 Resend a marketing text' : '📨 Resend a marketing piece'}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="gs-label">To</div>
          <div style={{ fontSize: 13, color: 'var(--def-text)', padding: '6px 0' }}>
            {sponsor.first_name} {sponsor.last_name} · {recipient || <em style={{ color: 'var(--def-danger)' }}>no {channel === 'email' ? 'email' : 'phone'} on file</em>}
          </div>
        </div>

        {mode === 'custom' && (
          <CustomMode
            channel={channel}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            charCount={charCount}
            smsSegments={smsSegments}
          />
        )}

        {mode === 'replay' && (
          <ReplayMode
            sponsor={sponsor}
            channel={channel}
            onClose={onClose}
            onSent={onCatchUpSent}
          />
        )}

        {/* Custom mode keeps the original send button. Replay mode has its
            own per-row send buttons inside the list. */}
        {mode === 'custom' && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="gs-btn" onClick={onClose}>Cancel</button>
            <button
              className="gs-btn gs-btn-primary"
              disabled={!recipient || !body.trim() || sending}
              onClick={handleSend}
            >
              {sending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : 'text'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: active ? 700 : 600,
        color: active ? 'var(--def-navy)' : 'var(--def-muted)',
        borderBottom: active ? '2px solid var(--event-accent)' : '2px solid transparent',
        marginBottom: -1,
        transition: 'color .15s, border-color .15s',
      }}
    >
      {label}
    </button>
  );
}

function CustomMode({ channel, subject, setSubject, body, setBody, charCount, smsSegments }) {
  return (
    <>
      {channel === 'email' && (
        <div style={{ marginBottom: 10 }}>
          <div className="gs-label">Subject</div>
          <input className="gs-input" value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <div className="gs-label">Message</div>
        <textarea
          className="gs-textarea"
          rows={channel === 'email' ? 8 : 4}
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        {channel === 'sms' && (
          <div style={{ fontSize: 11, color: 'var(--def-light)', marginTop: 4, textAlign: 'right' }}>
            {charCount} chars · {smsSegments} segment{smsSegments !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </>
  );
}

function ReplayMode({ sponsor, channel, onClose, onSent }) {
  // pipeline: null = loading; [] = nothing to show; otherwise array of
  // { phase, title, range, color, desc, sends: [...] } phases (email-only,
  // with empty phases stripped out).
  const [pipeline, setPipeline] = useState(null);
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(null); // { send } or null
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  useEffect(() => {
    let cancelled = false;
    loadMarketingPipeline()
      .then(phases => {
        if (cancelled) return;
        // Filter to the channel this composer is in — the email composer
        // shows email touchpoints, the text composer shows SMS touchpoints.
        // SMS catch-up uses the same recipient rule as the bulk SMS pipeline
        // (phone on file), so the consent posture matches what already goes
        // out. Drop phases with no remaining sends so we don't render empty
        // section headers.
        const want = (channel || 'email').toLowerCase();
        const filtered = phases
          .map(p => ({
            ...p,
            sends: (p.sends || []).filter(
              s => (s.channel || '').toLowerCase() === want
            ),
          }))
          .filter(p => p.sends.length > 0);
        setPipeline(filtered);
      })
      .catch(e => {
        if (!cancelled) setErr(e.message || 'Failed to load marketing pipeline');
      });
    return () => { cancelled = true; };
  }, [channel]);

  const handleConfirm = async () => {
    if (!confirming) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await sendCatchUp(sponsor.id, confirming.send.id);
      setResult({
        ok: true,
        message: `Sent "${confirming.send.title}" to ${res.recipient}.`,
      });
      setTimeout(() => {
        if (typeof onSent === 'function') onSent(confirming.send);
        onClose();
      }, 1100);
    } catch (e) {
      setResult({
        ok: false,
        message: e.message || 'Send failed',
      });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  if (err) {
    return (
      <div
        style={{
          padding: '20px 16px',
          background: 'var(--def-danger-soft)',
          color: 'var(--def-danger)',
          borderRadius: 'var(--def-radius-sm)',
          fontSize: 13,
        }}
      >
        Couldn't load marketing pipeline: {err}
      </div>
    );
  }

  if (pipeline === null) {
    return (
      <div style={{ padding: '20px 0', color: 'var(--def-light)', fontSize: 13, textAlign: 'center' }}>
        Loading marketing pipeline…
      </div>
    );
  }

  if (pipeline.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          background: 'var(--def-bg-soft)',
          color: 'var(--def-muted)',
          borderRadius: 'var(--def-radius-sm)',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        No {channel === 'sms' ? 'text' : 'email'} marketing pieces are configured. Use the Custom message tab
        for a one-off {channel === 'sms' ? 'text' : 'email'}.
      </div>
    );
  }

  const sponsorTier = (sponsor.sponsorship_tier || '').toLowerCase().trim();

  // Three-bucket tier classifier:
  //   'match' — audience explicitly targets this sponsor's tier
  //   'broad' — audience targets everyone (or a non-tier-specific group
  //             like "Confirmed Buyers", "Non-finalized", "Walk-up")
  //   'off'   — audience targets a different specific tier
  // Off-tier rows are dimmed (opacity 0.55) but still sendable per spec.
  const classifyTier = (audience) => {
    const a = (audience || '').toLowerCase();
    if (sponsorTier && a.includes(sponsorTier)) return 'match';
    // Audiences that apply broadly to anyone receive no dim.
    if (/everyone|all confirmed|all opt|broader|non-finalized|prior buyers|walk-up/i.test(a)) {
      return 'broad';
    }
    // If the audience names a *specific* tier and it isn't this sponsor's
    // tier, dim it.
    if (/platinum|gold|silver|bronze/i.test(a)) return 'off';
    // Unknown audience shape → don't dim (failure mode is "show too much",
    // never "hide a real send").
    return 'broad';
  };

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--def-muted)', marginBottom: 10 }}>
        Replay a marketing {channel === 'sms' ? 'text' : 'email'} that's already been sent, or pre-deliver one
        that's scheduled. Either way this sponsor gets the exact copy
        (with their portal link baked in) and the send is logged on their timeline.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 460, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
        {pipeline.map(phase => (
          <PhaseGroup
            key={phase.phase}
            phase={phase}
            classifyTier={classifyTier}
            onSend={send => setConfirming({ send })}
            disabled={busy}
            channel={channel}
          />
        ))}
      </div>

      {result && (
        <div
          style={{
            padding: '10px 14px',
            background: result.ok ? 'var(--def-success-soft)' : 'var(--def-danger-soft)',
            color: result.ok ? 'var(--def-success)' : 'var(--def-danger)',
            borderRadius: 'var(--def-radius-sm)',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          {result.ok ? '✓ ' : '✗ '}{result.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="gs-btn" onClick={onClose}>Close</button>
      </div>

      {confirming && (
        <ConfirmDialog
          send={confirming.send}
          sponsor={sponsor}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirm}
          channel={channel}
        />
      )}
    </>
  );
}

function PhaseGroup({ phase, classifyTier, onSend, disabled, channel }) {
  // Soft-tinted phase header band: left border in the phase color (matching
  // the Marketing tab pills), background at ~6% of the same color so the
  // section reads as a unit. Range shown in muted text on the right.
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '7px 12px',
          marginBottom: 6,
          borderLeft: `4px solid ${phase.color}`,
          background: phase.color + '14', // ~8% opacity
          borderRadius: '0 var(--def-radius-sm) var(--def-radius-sm) 0',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--def-navy)' }}>
          Phase {phase.phase} — {phase.title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--def-muted)', marginLeft: 'auto' }}>
          {phase.range}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {phase.sends.map(s => (
          <ReplayRow
            key={s.id}
            send={s}
            tier={classifyTier(s.audience)}
            onSend={() => onSend(s)}
            disabled={disabled}
            channel={channel}
          />
        ))}
      </div>
    </div>
  );
}
function ReplayRow({ send, tier, onSend, disabled, channel }) {
  // 'tier' is 'match' | 'broad' | 'off'. Off-tier rows are visually dimmed
  // per spec — admin can still send to them, the dim is a soft hint.
  const fired = !!send.firstSentAt;
  const matches = tier === 'match';
  const offTier = tier === 'off';

  // Date label:
  //   fired:   "Sent May 14, 9:21 AM" — uses real send timestamp
  //   not yet: "Scheduled May 28 · 6:00 AM" — pipeline-declared date/time
  let dateLabel = '—';
  if (fired && send.lastSentAt) {
    const d = new Date(send.lastSentAt.replace(' ', 'T') + (send.lastSentAt.includes('Z') ? '' : 'Z'));
    dateLabel = 'Sent ' + d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Denver',
    });
  } else if (send.date) {
    dateLabel = 'Scheduled ' + send.date + (send.time ? ' · ' + send.time : '');
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: '#fff',
        border: `1px solid ${matches ? 'var(--def-navy)' : 'var(--def-border)'}`,
        borderRadius: 'var(--def-radius-sm)',
        boxShadow: matches ? '0 0 0 1px #0d1b3d18' : 'none',
        opacity: offTier ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--def-navy)' }}>
            {send.title}
          </span>
          {fired ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 8,
                background: 'var(--def-success-soft)',
                color: 'var(--def-success)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              ✓ Sent
            </span>
          ) : (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 8,
                background: 'var(--def-bg-soft)',
                color: 'var(--def-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Scheduled
            </span>
          )}
          {matches && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 8,
                background: 'var(--def-navy)',
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Matches tier
            </span>
          )}
          {offTier && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 8,
                background: 'var(--def-bg-soft)',
                color: 'var(--def-muted)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                border: '1px solid var(--def-border)',
              }}
            >
              Different tier
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--def-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{channel === 'sms' ? '📱' : '📧'} {send.audience}</span>
          {fired && (
            <>
              <span>·</span>
              <span>{send.actualSent || 0} sent</span>
            </>
          )}
          <span>·</span>
          <span>{dateLabel}</span>
        </div>
        {send.subject && (
          <div style={{ fontSize: 11, color: 'var(--def-light)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Subject: "{send.subject}"
          </div>
        )}
      </div>
      <button
        className="gs-btn gs-btn-primary"
        onClick={onSend}
        disabled={disabled}
        style={{ flexShrink: 0 }}
      >
        {fired ? 'Send to this sponsor' : 'Pre-deliver'}
      </button>
    </div>
  );
}

function ConfirmDialog({ send, sponsor, busy, onCancel, onConfirm, channel }) {
  return (
    <div
      className="gs-modal-bg"
      onClick={busy ? undefined : onCancel}
      style={{ zIndex: 1100 }}
    >
      <div
        className="gs-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="gs-modal-h">
          <div className="gs-modal-title">
            {send.firstSentAt ? `Send "${send.title}"?` : `Pre-deliver "${send.title}"?`}
          </div>
          {!busy && (
            <button className="gs-modal-close" onClick={onCancel}>×</button>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--def-text)', lineHeight: 1.55, marginBottom: 16 }}>
          {send.firstSentAt
            ? <>We'll send the exact same {channel === 'sms' ? 'text' : 'email'} that <strong>{send.audience}</strong> already received — with {sponsor.first_name || sponsor.company}'s portal link baked in — to:</>
            : <>This {channel === 'sms' ? 'text' : 'email'} is scheduled to go to <strong>{send.audience}</strong>{send.date ? ` on ${send.date}` : ''}. We'll pre-deliver it to {sponsor.first_name || sponsor.company} right now — with their portal link baked in — to:</>
          }
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              background: 'var(--def-bg-soft)',
              borderRadius: 'var(--def-radius-sm)',
              fontFamily: 'var(--def-mono)',
              fontSize: 12,
              color: 'var(--def-navy)',
              wordBreak: 'break-all',
            }}
          >
            {channel === 'sms' ? sponsor.phone : sponsor.email}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--def-muted)' }}>
            {send.firstSentAt
              ? `This is a real send. There's no undo. The send will be logged on this sponsor's timeline.`
              : `Heads-up: this sponsor will receive this email before everyone else. When the scheduled bulk send fires${send.date ? ' on ' + send.date : ''}, they'll likely receive it again unless you exclude them at that time. The send will be logged on this sponsor's timeline.`
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="gs-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="gs-btn gs-btn-primary"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Sending…' : (send.firstSentAt ? 'Yes, send it' : 'Yes, pre-deliver')}
          </button>
        </div>
      </div>
    </div>
  );
}
