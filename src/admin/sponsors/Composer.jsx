import React, { useState, useEffect } from 'react';

export function Composer({ sponsor, channel, onClose, onSend }) {
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
        <div style={{ marginBottom: 12 }}>
          <div className="gs-label">To</div>
          <div style={{ fontSize: 13, color: 'var(--def-text)', padding: '6px 0' }}>
            {sponsor.first_name} {sponsor.last_name} · {recipient || <em style={{ color: 'var(--def-danger)' }}>no {channel === 'email' ? 'email' : 'phone'} on file</em>}
          </div>
        </div>
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
      </div>
    </div>
  );
}
