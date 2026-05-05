// useDinnerCompleteness — Phase 1.9 H2.
//
// Reads the portal's myAssignments array and reports whether every
// finalized seat has a dinner_choice. Drives the Done button gate:
// while any seat is missing dinner, the button reads "Pick dinner for
// N more seat(s)" and stays disabled. When all placed seats have a
// dinner_choice, the button flips to "Done — send me my QR" and
// finalize-fires.
//
// Mirrors v1 gala-seats-app.html:2349 updateDoneReady() — same intent,
// React-shaped output.
//
// Returned shape:
//   {
//     allComplete: boolean,    // true iff list has items AND zero missing
//     missingCount: number,    // count of placed seats without dinner
//     totalCount: number,      // total placed seats
//     missingSeats: [{theater_id, row_label, seat_num}],
//   }
//
// Note: when totalCount === 0 (no seats placed yet) allComplete stays
// false. The /finalize endpoint already 400s with "No seats picked
// yet" in that case, so this hook keeps the UI honest about the
// underlying server contract — the Done button shouldn't even render
// until at least one seat is placed.

import { useMemo } from 'react';

export function useDinnerCompleteness(myAssignments) {
  return useMemo(() => {
    const list = myAssignments || [];
    const missing = list.filter((a) => !a.dinner_choice);
    const totalCount = list.length;
    const missingCount = missing.length;
    return {
      allComplete: totalCount > 0 && missingCount === 0,
      missingCount,
      totalCount,
      missingSeats: missing.map((a) => ({
        theater_id: a.theater_id,
        row_label: a.row_label,
        seat_num: a.seat_num,
      })),
    };
  }, [myAssignments]);
}
