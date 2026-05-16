// DelegationManageModal — v2 chrome around the existing DelegateManage.
//
// DelegateManage handles the full lifecycle of an existing invite:
//   - Render current status (invited / claimed / declined)
//   - Resend the link via email + SMS
//   - Revoke (releases the seats back to the sponsor's pool)
//
// Same reuse pattern as InviteModal — DelegateManage is battle-tested
// and self-contained; v2 just supplies the modal chrome.

import { useEffect } from 'react';
import { config } from '../config.js';
import { DelegateManage } from '../portal/Portal.jsx';

export function DelegationManageModal({ delegation, token, onClose, onRefresh }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name =
    delegation?.delegateName ||
    delegation?.guest_name ||
    delegation?.email ||
    delegation?.guest_email ||
    'Guest';

  return (
    <div
      className="p2-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="p2-modal stripped p2-legacy-form-host">
        <div className="p2-modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="p2-modal-eyebrow">Manage invite</div>
            <div className="p2-modal-title">{name}</div>
          </div>
          <button className="p2-modal-close" onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p2-modal-body">
          <DelegateManage
            delegation={delegation}
            token={token}
            apiBase={config.apiBase}
            onRefresh={onRefresh || (() => Promise.resolve())}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
