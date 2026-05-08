import React, { useState, useEffect } from 'react';

/**
 * Catch-up composer. Pre-filled with the canonical pipeline message for the
 * given send. Admin can:
 *   - Send as-is (no edits) → backend uses canonical subject/body
 *   - Edit subject/body → backend logs the override (still under same send_id)
 *
 * Catch-up emails dated weeks ago often need an "Apologies for the delay"
 * intro, hence editability. Default is verbatim — fastest path for an admin
 * working through 5-10 missed sends in one sitting.
 */
export function CatchUpComposer({ sponsor, send, onClose, onSend }) {
  const channel = (send.channel || '').toLowerCase();
  const [subject, setSubject] = useState(send.subject || '');
  const [body, setBody]       = useState(send.body || '');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState(null);

  // Reset when switching sends without unmounting (defensive — currently we
  // remount each open, but cheap insurance)
  useEffect(() => {
    setSubject(send.subject || '');
    setBody(send.body || '');
    setError(null);
  }, [send.send_id]);

  const recipient = channel === 'email' ? sponsor.email : sponsor.phone;
  const subjectChanged = (subject || '') !== (send.subject || '');
  const bodyChanged    = (body || '') !== (send.body || '');
  const hasOverride    = subjectChanged || bodyChanged;

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await onSend({
        sponsorId: sponsor.id,
        sendId: send.send_id,
        subjectOverride: subjectChanged ? subject : null,
        bodyOverride:    bodyChanged    ? body    : null,
      });
    } catch (e) {
      setError(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const sendDate = send.date || '(no date)';
  const headerLabel = channel === 'email'
    ? `Catch-up email — ${sponsor.company || sponsor.first_name || 'sponsor'}`
    : `Catch-up text — ${sponsor.company || sponsor.first_name || 'sponsor'}`;

  return (
    <div className="gs-modal-bg" onClick={onClose}>
      <div className="gs-modal" onClick={e => e.stopPropagation()}>
        <div className="gs-modal-h">
          <div className="gs-modal-title">
            {channel === 'email' ? '📧' : '📱'} {headerLabel}
          </div>
          <button className="gs-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="gs-pipe-modal-meta">
          <div>
            <span className="gs-label">Originally scheduled for</span>
            <span className="gs-pipe-modal-meta-val">{sendDate}</span>
          </div>
          <div>
            <span className="gs-label">Pipeline row</span>
            <span className="gs-pipe-modal-meta-val">
              {send.title || send.send_id}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="gs-label">To</div>
          <div className="gs-pipe-modal-recipient">
            {sponsor.first_name} {sponsor.last_name}
            {sponsor.company && <> · {sponsor.company}</>}
            {' · '}
            {recipient || (
              <em style={{ color: 'var(--def-danger)' }}>
                no {channel === 'email' ? 'email' : 'phone'} on file
              </em>
            )}
          </div>
        </div>

        {channel === 'email' && (
          <div style={{ marginBottom: 10 }}>
            <div className="gs-label">Subject</div>
            <input
              className="gs-input"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div className="gs-label">
            Message
            {hasOverride && (
              <span className="gs-pipe-modal-edited-tag">edited</span>
            )}
          </div>
          {channel === 'email' ? (
            <textarea
              className="gs-textarea"
              rows={10}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          ) : (
            <>
              <textarea
                className="gs-textarea"
                rows={4}
                value={body}
                onChange={e => setBody(e.target.value)}
              />
              <div className="gs-pipe-modal-sms-meter">
                {body.length} chars · {Math.max(1, Math.ceil(body.length / 160))} segment{body.length > 160 ? 's' : ''}
              </div>
            </>
          )}
        </div>

        {channel === 'email' && (
          <div className="gs-pipe-modal-hint">
            Body is sent through the gala email wrapper — a "Hi {sponsor.first_name || 'there'}," is added automatically.
            HTML is supported. For a "sorry for the delay" intro, add a line at the top of the body.
          </div>
        )}

        {error && <div className="gs-pipe-modal-error">{error}</div>}

        <div className="gs-pipe-modal-actions">
          <button className="gs-btn" onClick={onClose} disabled={sending}>Cancel</button>
          <button
            className="gs-btn gs-btn-primary"
            disabled={!recipient || !body.trim() || (channel === 'email' && !subject.trim()) || sending}
            onClick={handleSend}
          >
            {sending
              ? 'Sending…'
              : (hasOverride
                 ? `Send edited ${channel === 'email' ? 'email' : 'text'}`
                 : `Send to ${sponsor.company || 'sponsor'}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
