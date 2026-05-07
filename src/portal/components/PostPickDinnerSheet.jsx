import { useEffect, useMemo, useState } from 'react';
import { BRAND } from '../../brand/tokens.js';
import { Icon } from '../../brand/atoms.jsx';
import DinnerPicker from './DinnerPicker.jsx';

const rowKey = (row) => `${row.theater_id}-${row.row_label}-${row.seat_num}`;

export default function PostPickDinnerSheet({
  assignments = [],
  token,
  apiBase = '',
  onRefresh,
  onDone,
  canFinalize = false,
  onFinalize = null,
  finalizing = false,
  error = null,
  onClearError = null,
}) {
  const rows = useMemo(
    () => [...assignments].sort((a, b) => `${a.row_label}${a.seat_num}`.localeCompare(`${b.row_label}${b.seat_num}`, undefined, { numeric: true })),
    [assignments]
  );
  const [choices, setChoices] = useState({});

  useEffect(() => {
    setChoices((prev) => {
      const next = {};
      rows.forEach((row) => {
        const key = rowKey(row);
        next[key] = prev[key] ?? row.dinner_choice ?? '';
      });
      return next;
    });
  }, [rows]);

  const selectedCount = rows.filter((row) => choices[rowKey(row)]).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const updateChoice = (row, value) => {
    setChoices((prev) => ({ ...prev, [rowKey(row)]: value || '' }));
  };

  const handleDone = async () => {
    if (!allSelected || finalizing) return;
    if (canFinalize && onFinalize) {
      try {
        await onFinalize();
      } catch {
        // useFinalize owns the rendered error state.
      }
      return;
    }
    onDone?.();
  };

  return (
    <div className="post-pick-dinner-sheet">
      <div className="post-pick-dinner-intro">
        <span>{selectedCount} of {rows.length} selected</span>
        <strong>{allSelected ? 'Dinner choices ready' : 'Choose a meal for each seat.'}</strong>
      </div>

      {rows.length > 0 ? (
        <div className="post-pick-dinner-list">
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <div className="post-pick-dinner-row" key={key}>
                <span className="post-pick-dinner-seat">
                  {row.row_label}{row.seat_num}
                </span>
                <DinnerPicker
                  assignment={{ ...row, dinner_choice: choices[key] || '' }}
                  token={token}
                  apiBase={apiBase}
                  onChange={(next) => updateChoice(row, next)}
                  onSaved={() => onRefresh?.()}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="post-pick-dinner-empty">Dinner seats are still syncing.</div>
      )}

      {error && (
        <div className="post-pick-dinner-error" role="alert">
          <span>{error.message || String(error)}</span>
          {onClearError && (
            <button aria-label="Dismiss error" onClick={onClearError}>×</button>
          )}
        </div>
      )}

      {allSelected && (
        <button
          className="post-pick-dinner-done"
          data-testid="dinner-done"
          onClick={handleDone}
          disabled={finalizing}
          aria-busy={finalizing || undefined}
        >
          <span>
            <Icon name={canFinalize ? 'qr' : 'check'} size={17} stroke={2.4} />
          </span>
          {finalizing
            ? 'Sending your QR...'
            : canFinalize
              ? 'Done - send my QR'
              : 'Done'}
        </button>
      )}
    </div>
  );
}
