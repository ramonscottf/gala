import React, { useState, useEffect, useCallback } from 'react';
import { loadSponsorPipeline } from './api.js';

/**
 * Per-sponsor marketing pipeline view. Lives inside the expanded sponsor
 * row, below the touchpoint timeline / EditPanel grid. Shows every
 * scheduled send with a status pill and — for missed sends — a "Send now"
 * button that opens the catch-up composer.
 *
 * Collapsed by default: a single header row showing "X of Y received" with
 * a chevron. Click to expand the per-phase send list.
 */
export function PipelineSection({ sponsor, onSendNow, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSponsorPipeline(sponsor.id);
      setData(result);
    } catch (e) {
      setError(e.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [sponsor.id]);

  // Lazy-load on first expand; refresh when refreshKey changes (after a send)
  useEffect(() => {
    if (open && (!data || refreshKey)) {
      fetchPipeline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  const summary = data?.summary;
  const headerLabel = summary
    ? `${summary.received} of ${summary.received + summary.missed + summary.upcoming} received`
    : 'Pipeline status';
  const missedCount = summary?.missed || 0;

  return (
    <div className="gs-pipe">
      <button
        type="button"
        className={`gs-pipe-head ${open ? 'is-open' : ''} ${missedCount > 0 ? 'has-missed' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="gs-pipe-chev" aria-hidden>{open ? '▾' : '▸'}</span>
        <span className="gs-pipe-head-title">Pipeline status</span>
        <span className="gs-pipe-head-summary">{headerLabel}</span>
        {missedCount > 0 && (
          <span className="gs-pipe-missed-badge">{missedCount} missed</span>
        )}
      </button>

      {open && (
        <div className="gs-pipe-body">
          {loading && <div className="gs-pipe-loading">Loading pipeline…</div>}
          {error && (
            <div className="gs-pipe-error">
              {error}{' '}
              <button className="gs-btn gs-btn-text" onClick={fetchPipeline}>Retry</button>
            </div>
          )}
          {!loading && !error && data && (
            <PipelineBody data={data} sponsor={sponsor} onSendNow={onSendNow} />
          )}
        </div>
      )}
    </div>
  );
}

function PipelineBody({ data, sponsor, onSendNow }) {
  const { phases, summary } = data;
  const allNotTargeted = summary.received === 0 && summary.missed === 0 && summary.upcoming === 0;

  if (allNotTargeted) {
    return (
      <div className="gs-pipe-empty">
        This sponsor isn't targeted by any pipeline send. Tier{' '}
        <strong>{sponsor.sponsorship_tier || '(none)'}</strong> doesn't match any
        of the configured audiences. Use <strong>Compose email</strong> below to
        send something one-off.
      </div>
    );
  }

  return (
    <div className="gs-pipe-phases">
      {phases.map(phase => (
        <PhaseBlock
          key={phase.phase}
          phase={phase}
          sponsor={sponsor}
          onSendNow={onSendNow}
        />
      ))}
    </div>
  );
}

function PhaseBlock({ phase, sponsor, onSendNow }) {
  const targeted = phase.sends.filter(s => s.status !== 'not-targeted');
  const sentCount = phase.sends.filter(s => s.status === 'sent').length;
  const targetedCount = targeted.length;
  const allUntargeted = targetedCount === 0;

  // Skip phases that don't apply to this sponsor at all — keeps the view focused.
  if (allUntargeted) return null;

  return (
    <div className="gs-pipe-phase">
      <div className="gs-pipe-phase-head">
        <span className="gs-pipe-phase-title">
          Phase {phase.phase}: {phase.title}
        </span>
        <span className="gs-pipe-phase-progress">
          {sentCount}/{targetedCount} sent
        </span>
      </div>
      <div className="gs-pipe-sends">
        {phase.sends.map(send => (
          <SendRow
            key={send.send_id}
            send={send}
            sponsor={sponsor}
            onSendNow={onSendNow}
          />
        ))}
      </div>
    </div>
  );
}

const STATUS_META = {
  sent:           { sym: '✓', cls: 'sent',         label: 'Sent' },
  missed:         { sym: '!', cls: 'missed',       label: 'Missed' },
  upcoming:       { sym: '⏰', cls: 'upcoming',     label: 'Upcoming' },
  'not-targeted': { sym: '·', cls: 'not-targeted', label: 'Not targeted' },
};

function SendRow({ send, sponsor, onSendNow }) {
  const meta = STATUS_META[send.status] || STATUS_META['not-targeted'];

  return (
    <div className={`gs-pipe-send is-${meta.cls}`}>
      <div className={`gs-pipe-send-icon is-${meta.cls}`}>{meta.sym}</div>
      <div className="gs-pipe-send-main">
        <div className="gs-pipe-send-title">
          {send.title || send.subject || `Send ${send.send_id}`}
        </div>
        <div className="gs-pipe-send-sub">
          <span className="gs-pipe-send-channel">{send.channel}</span>
          <span className="gs-pipe-send-dot">·</span>
          <span className="gs-pipe-send-date">{formatDate(send.date)}</span>
          {send.status === 'sent' && send.received_at && (
            <>
              <span className="gs-pipe-send-dot">·</span>
              <span className="gs-pipe-send-time">
                Received {formatDateTime(send.received_at)}
              </span>
            </>
          )}
          {send.status === 'upcoming' && (
            <>
              <span className="gs-pipe-send-dot">·</span>
              <span className="gs-pipe-send-time">scheduled</span>
            </>
          )}
        </div>
      </div>
      <div className="gs-pipe-send-action">
        {send.status === 'missed' && (
          <button
            className="gs-btn gs-btn-primary"
            onClick={() => onSendNow(sponsor, send)}
            disabled={!canSend(send, sponsor)}
            title={canSend(send, sponsor) ? '' : noSendReason(send, sponsor)}
          >
            Send now
          </button>
        )}
        {send.status === 'sent' && (
          <button
            className="gs-btn gs-btn-text"
            onClick={() => onSendNow(sponsor, send)}
            disabled={!canSend(send, sponsor)}
            title="Send this message again"
          >
            Resend
          </button>
        )}
      </div>
    </div>
  );
}

function canSend(send, sponsor) {
  const ch = (send.channel || '').toLowerCase();
  if (ch === 'email') return !!sponsor.email;
  if (ch === 'sms')   return !!sponsor.phone;
  return false;
}

function noSendReason(send, sponsor) {
  const ch = (send.channel || '').toLowerCase();
  if (ch === 'email' && !sponsor.email) return 'Sponsor has no email on file';
  if (ch === 'sms'   && !sponsor.phone) return 'Sponsor has no phone on file';
  return 'Channel not supported';
}

function formatDate(d) {
  if (!d) return '(no date)';
  // d is YYYY-MM-DD; render as "May 7"
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  const date = new Date(y, m - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC, no Z). Treat as UTC.
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
         ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
