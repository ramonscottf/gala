// OnBehalfControls — small shared bits for sponsor-as-guest editing.
//
// These two components render at the top and bottom of each of the
// editing modals (DinnerModal, SwapSeatModal, MoveGroupModal) so the
// sponsor never forgets which scope they're editing in, and so they
// can choose to send (or skip) a notification to the guest.

export function OnBehalfBanner({ name }) {
  if (!name) return null;
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        marginBottom: 16,
        borderRadius: 10,
        background: 'rgba(244, 185, 66, 0.12)',
        border: '1px solid rgba(244, 185, 66, 0.36)',
        color: 'var(--p2-gold)',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>✎</span>
      <span>
        Editing on behalf of <strong>{name}</strong>
      </span>
    </div>
  );
}

export function NotifyToggle({ name, on, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 18,
        padding: '12px 14px',
        borderRadius: 10,
        background: on ? 'rgba(244, 185, 66, 0.08)' : 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${on ? 'rgba(244, 185, 66, 0.28)' : 'rgba(255, 255, 255, 0.08)'}`,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--p2-text, #fff)' }}>
          {on ? `Notify ${name}` : 'Silent edit'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--p2-subtle)', marginTop: 2 }}>
          {on
            ? 'Push the updated ticket details after saving'
            : `${name} won't be told the seat changed`}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        style={{
          position: 'relative',
          width: 44,
          height: 26,
          flexShrink: 0,
          borderRadius: 999,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          background: on ? 'var(--p2-gold)' : 'rgba(255, 255, 255, 0.18)',
          transition: 'background 0.15s ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 20 : 2,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: on ? '#0f1639' : '#fff',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
    </div>
  );
}
