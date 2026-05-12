import React, { useState, useEffect } from 'react';
import { loadCatchUpSends, sendCatchUp } from './api.js';

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

        {/* Mode tabs — email channel only. SMS keeps the simple custom-only UI. */}
        {channel === 'email' && (
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
              label="📨 Resend a marketing piece"
            />
          </div>
        )}

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

        {mode === 'replay' && channel === 'email' && (
          <ReplayMode
            sponsor={sponsor}
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

function ReplayMode({ sponsor, onClose, onSent }) {
  const [sends, setSends] = useState(null); // null = loading
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(null); // { send } or null
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  useEffect(() => {
    let cancelled = false;
    loadCatchUpSends()
      .then(list => {
        if (cancelled) return;
        // Default: email only. SMS catch-up isn't supported yet (see endpoint).
        setSends(list.filter(s => s.channel === 'email'));
      })
      .catch(e => {
        if (!cancelled) setErr(e.message || 'Failed to load sends');
      });
    return () => { cancelled = true; };
  }, []);

  const handleConfirm = async () => {
    if (!confirming) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await sendCatchUp(sponsor.id, confirming.send.sendId);
      setResult({
        ok: true,
        message: `Sent "${confirming.send.title}" to ${res.recipient}.`,
      });
      // Brief pause so user sees the green toast, then close — the
      // parent's onCatchUpSent callback fires refresh + its own toast.
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
        Couldn't load marketing sends: {err}
      </div>
    );
  }

  if (sends === null) {
    return (
      <div style={{ padding: '20px 0', color: 'var(--def-light)', fontSize: 13, textAlign: 'center' }}>
        Loading sent marketing pieces…
      </div>
    );
  }

  if (sends.length === 0) {
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
        No marketing pieces have been sent yet. Use the Custom message tab
        for a one-off email.
      </div>
    );
  }

  // Highlight rows whose audience matches this sponsor's tier (soft hint —
  // doesn't change behavior, just helps admin pick the right row faster).
  const sponsorTier = (sponsor.sponsorship_tier || '').toLowerCase();
  const tierMatches = (audience) => {
    if (!sponsorTier) return false;
    return (audience || '').toLowerCase().includes(sponsorTier);
  };

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--def-muted)', marginBottom: 10 }}>
        Pick a marketing email that's already gone out. We'll send the exact
        same copy (with this sponsor's portal link) and log it on their
        timeline.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
        {sends.map(s => (
          <ReplayRow
            key={s.sendId}
            send={s}
            matchesTier={tierMatches(s.audience)}
            onSend={() => setConfirming({ send: s })}
            disabled={busy}
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
        />
      )}
    </>
  );
}

function ReplayRow({ send, matchesTier, onSend, disabled }) {
  const date = send.lastSentAt
    ? new Date(send.lastSentAt.replace(' ', 'T') + (send.lastSentAt.includes('Z') ? '' : 'Z'))
    : null;
  const dateLabel = date
    ? date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Denver',
      })
    : '—';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: '#fff',
        border: `1px solid ${matchesTier ? 'var(--def-navy)' : 'var(--def-border)'}`,
        borderRadius: 'var(--def-radius-sm)',
        boxShadow: matchesTier ? '0 0 0 1px #0d1b3d18' : 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--def-navy)' }}>
            {send.title}
          </span>
          {matchesTier && (
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
        </div>
        <div style={{ fontSize: 11, color: 'var(--def-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>📧 {send.audience}</span>
          <span>·</span>
          <span>{send.totalSent} sent</span>
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
        Send to this sponsor
      </button>
    </div>
  );
}

function ConfirmDialog({ send, sponsor, busy, onCancel, onConfirm }) {
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
          <div className="gs-modal-title">Send "{send.title}"?</div>
          {!busy && (
            <button className="gs-modal-close" onClick={onCancel}>×</button>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--def-text)', lineHeight: 1.55, marginBottom: 16 }}>
          We'll send the exact same email that {send.audience} received
          {send.lastSentAt ? ' previously' : ''} — with {sponsor.first_name || sponsor.company}'s
          portal link baked in — to:
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
            {sponsor.email}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--def-muted)' }}>
            This is a real send. There's no undo. The send will be logged on
            this sponsor's timeline.
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
            {busy ? 'Sending…' : 'Yes, send it'}
          </button>
        </div>
      </div>
    </div>
  );
}
