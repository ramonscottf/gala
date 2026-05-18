// TicketRowMenu — small popover with row-level actions (Phase 5.7+ item D).
//
// Replaces inline View/Edit buttons with a single ⋯ that opens a menu:
//   View ticket  → open the group/single modal (default row behavior)
//   Change seats → open seat picker
//   Pick meals   → open the group modal (where per-seat dinner pills live)
//   Reassign / Gift → open the group modal at the assign affordance
//   Release      → release the entire group
//
// Anchored relative to its trigger button. Click outside or Escape closes.

import { useEffect, useRef, useState } from 'react';

export function TicketRowMenu({
  onView,
  onChangeSeats,
  onPickMeals,
  onReassign,
  onRelease,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handle = (fn) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    if (fn) fn();
  };

  return (
    <div className="p2-ticket-menu" ref={rootRef}>
      <button
        type="button"
        className="p2-ticket-menu-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Ticket actions"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <ul className="p2-ticket-menu-list" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="p2-ticket-menu-item"
              onClick={handle(onView)}
            >
              View ticket
            </button>
          </li>
          {onChangeSeats && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="p2-ticket-menu-item"
                onClick={handle(onChangeSeats)}
              >
                Change seats
              </button>
            </li>
          )}
          {onPickMeals && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="p2-ticket-menu-item"
                onClick={handle(onPickMeals)}
              >
                Pick meals
              </button>
            </li>
          )}
          {onReassign && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="p2-ticket-menu-item"
                onClick={handle(onReassign)}
              >
                Reassign / Gift
              </button>
            </li>
          )}
          {onRelease && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="p2-ticket-menu-item danger"
                onClick={handle(onRelease)}
              >
                Release
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
