/* ════════════════════════════════════════════════════════════════════════
 * DEF Gala 2026 — Run-of-Show Excel export (shared module)
 * ------------------------------------------------------------------------
 * One source of truth for the "Download for theater (Excel)" export, used by
 * the Schedule page, the Seating Chart, and the Volunteers tab.
 *
 * Adds live GUEST COUNTS: per auditorium × showing on every row, plus a
 * "Guest Count Summary" block (per-auditorium and per-showing totals).
 *
 * Self-contained — fetches its own data so it works on any page:
 *   /api/gala/movies          → showtimes (lineup, times, capacity)
 *   /data/theater-layouts.json → physical seat counts
 *   /api/gala/board           → fill[aud:sh].assigned  (guests seated, live)
 *
 * Usage:  window.GalaRunOfShow.download(buttonEl)
 *   buttonEl is optional; if passed, it shows a "Preparing…" state.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── tiny time helpers (mirror schedule.html) ──
  function parseMin(t) {
    if (!t) return null;
    var m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t);
    if (!m) return null;
    var h = (+m[1]) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + (+m[2]);
  }
  function fmtMin(n) {
    if (n == null) return '—';
    var h = Math.floor(n / 60), m = n % 60;
    var ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  // ── fetch the three data sources ──
  function loadData() {
    return Promise.all([
      fetch('/api/gala/movies').then(function (r) { return r.json(); }),
      fetch('/data/theater-layouts.json').then(function (r) { return r.json(); }).catch(function () { return { theaters: [] }; }),
      fetch('/api/gala/board').then(function (r) { return r.json(); }).catch(function () { return { fill: {} }; })
    ]).then(function (res) {
      var layouts = {};
      (res[1].theaters || []).forEach(function (t) { layouts[t.id] = t; });
      return {
        showtimes: (res[0].showtimes || []).slice(),
        layouts: layouts,
        fill: (res[2] && res[2].fill) || {}
      };
    });
  }

  // ── build one row per (auditorium, showing), with live guest count ──
  function buildRows(data) {
    var byT = {};
    data.showtimes.forEach(function (st) { (byT[st.theater_id] = byT[st.theater_id] || []).push(st); });
    var out = [];
    Object.keys(byT).map(Number).sort(function (a, b) { return a - b; }).forEach(function (aud) {
      var sts = byT[aud].slice().sort(function (a, b) { return a.showing_number - b.showing_number; });
      var e1 = null, s2 = null;
      sts.forEach(function (st) {
        if (st.showing_number === 1) e1 = (st.show_end_minutes != null ? st.show_end_minutes : null);
        if (st.showing_number === 2) s2 = parseMin(st.show_start);
      });
      sts.forEach(function (st) {
        var turn = (st.showing_number === 1 && e1 != null && s2 != null) ? (s2 - e1) : '';
        var seats = (data.layouts[st.theater_id] && data.layouts[st.theater_id].totalSeats) || st.capacity || '';
        var guests = (data.fill[aud + ':' + st.showing_number] && data.fill[aud + ':' + st.showing_number].assigned) || 0;
        var fillPct = (seats && +seats > 0) ? Math.round(guests / +seats * 100) : '';
        out.push({
          sh: st.showing_number,
          aud: aud,
          movie: st.movie_title || '— Flex / hold (no film) —',
          dinner: st.dinner_time || '',
          show: st.show_start || '',
          rt: st.movie_runtime || '—',
          end: st.show_end_label || (st.show_end_minutes != null ? fmtMin(st.show_end_minutes) : '—'),
          turn: turn,
          seats: seats,
          guests: guests,
          fillPct: fillPct,
          notes: st.notes || ''
        });
      });
    });
    return out;
  }

  // ── per-auditorium & per-showing guest totals for the summary block ──
  function buildSummary(rows) {
    var byAud = {};
    rows.forEach(function (r) {
      var a = byAud[r.aud] || (byAud[r.aud] = { aud: r.aud, sh1: 0, sh2: 0 });
      if (r.sh === 1) a.sh1 += (r.guests || 0);
      else if (r.sh === 2) a.sh2 += (r.guests || 0);
    });
    var auds = Object.keys(byAud).map(Number).sort(function (a, b) { return a - b; });
    var totSh1 = 0, totSh2 = 0;
    auds.forEach(function (a) { totSh1 += byAud[a].sh1; totSh2 += byAud[a].sh2; });
    return {
      auds: auds.map(function (a) { return byAud[a]; }),
      totSh1: totSh1, totSh2: totSh2, grand: totSh1 + totSh2
    };
  }

  // ── styled .xlsx (mirrors schedule.html aesthetic, 12 cols) ──
  function makeXlsx(rows, summary) {
    var NAVY = 'FF0D1B3D', LBLUE = 'FFEAF0FB', LGOLD = 'FFFBF3DD', MUT = 'FF44506B',
        REDF = 'FFF8C9C9', REDT = 'FF9B1C1C', LINE = 'FFC9D2E3',
        GRNF = 'FFDDF3E4', GRNT = 'FF166534', GREYF = 'FFEDF1F7';
    var border = {
      top: { style: 'thin', color: { argb: LINE } }, left: { style: 'thin', color: { argb: LINE } },
      bottom: { style: 'thin', color: { argb: LINE } }, right: { style: 'thin', color: { argb: LINE } }
    };
    var LAST = 'L'; // 12 columns
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Run of Show', { views: [{ state: 'frozen', ySplit: 4 }] });

    var r1 = ws.addRow(['Davis Education Foundation Gala 2026 — Theatre Run-of-Show']); ws.mergeCells('A1:' + LAST + '1');
    var c1 = r1.getCell(1); c1.font = { name: 'Arial', bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c1.alignment = { horizontal: 'center', vertical: 'middle' }; r1.height = 26;

    var r2 = ws.addRow(['Wednesday, June 10, 2026  ·  Megaplex Theatres at Legacy Crossing, Centerville, UT  ·  Doors 4:00 PM']); ws.mergeCells('A2:' + LAST + '2');
    var c2 = r2.getCell(1); c2.font = { name: 'Arial', size: 10, italic: true, color: { argb: MUT } }; c2.alignment = { horizontal: 'center' }; r2.height = 18;
    ws.addRow([]);

    var hr = ws.addRow(['Showing', 'Auditorium', 'Movie', 'Dinner Served', 'Showtime', 'Runtime (min)', 'Approx. End', 'Turnover After (min)', 'Total Seats', 'Guests Seated', 'Fill %', 'Notes']); hr.height = 30;
    hr.eachCell(function (c) { c.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; });

    rows.forEach(function (d) {
      var r = ws.addRow(['Showing ' + d.sh, 'Aud ' + d.aud, d.movie, d.dinner, d.show, d.rt, d.end, (d.turn === '' ? '—' : d.turn), d.seats, d.guests, (d.fillPct === '' ? '—' : d.fillPct + '%'), d.notes]);
      var band = d.sh === 1 ? LBLUE : LGOLD;
      for (var col = 1; col <= 12; col++) {
        var c = r.getCell(col);
        c.font = { name: 'Arial', size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
        c.alignment = { horizontal: (col === 3 || col === 12) ? 'left' : 'center', vertical: 'middle' };
        c.border = border;
      }
      // Guests Seated — bold so the head count reads at a glance
      var gc = r.getCell(10); gc.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } };
      // Fill % — gentle green when room is essentially full
      if (typeof d.fillPct === 'number' && d.fillPct >= 95) { var fc2 = r.getCell(11); fc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRNF } }; fc2.font = { name: 'Arial', size: 10, bold: true, color: { argb: GRNT } }; }
      // Turnover red when tight (<40 min)
      if (typeof d.turn === 'number' && d.turn < 40) { var tc = r.getCell(8); tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REDF } }; tc.font = { name: 'Arial', size: 10, bold: true, color: { argb: REDT } }; }
    });

    ws.addRow([]);
    var fr = ws.addRow(["Total Seats = the room's physical seat count. Guests Seated = seats currently assigned to guests (live as of export — updates as seating changes). Fill % = Guests Seated ÷ Total Seats. Approx. End = showtime + ~5 min preshow reel + film runtime. Turnover After = minutes between this room's Showing-1 end and its Showing-2 start (cleaning/reseat window). Red = tight (<40 min)."]);
    var fnn = fr.number; ws.mergeCells('A' + fnn + ':' + LAST + fnn);
    var fc = fr.getCell(1); fc.font = { name: 'Arial', size: 9, italic: true, color: { argb: MUT } }; fc.alignment = { wrapText: true, vertical: 'top' }; fr.height = 52;

    // ── GUEST COUNT SUMMARY ──
    ws.addRow([]);
    var sh = ws.addRow(['Guest Count Summary — guests placed per auditorium & showing (live as of export)']);
    var shn = sh.number; ws.mergeCells('A' + shn + ':' + LAST + shn);
    var shc = sh.getCell(1); shc.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    shc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; shc.alignment = { horizontal: 'left', vertical: 'middle' }; sh.height = 22;

    // Big-number per-showing line
    var bl = ws.addRow(['Showing 1: ' + summary.totSh1 + ' guests   ·   Showing 2: ' + summary.totSh2 + ' guests   ·   Grand Total: ' + summary.grand + ' guests']);
    var bln = bl.number; ws.mergeCells('A' + bln + ':' + LAST + bln);
    var blc = bl.getCell(1); blc.font = { name: 'Arial', bold: true, size: 12, color: { argb: NAVY } };
    blc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LBLUE } }; blc.alignment = { horizontal: 'center', vertical: 'middle' }; bl.height = 22;
    blc.border = border;

    // 4-column breakdown table
    var shdr = ws.addRow(['Auditorium', 'Showing 1 Guests', 'Showing 2 Guests', 'Auditorium Total']);
    for (var hc = 1; hc <= 4; hc++) { var h = shdr.getCell(hc); h.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; h.alignment = { horizontal: 'center', vertical: 'middle' }; h.border = border; }

    summary.auds.forEach(function (a) {
      var r = ws.addRow(['Aud ' + a.aud, a.sh1, a.sh2, a.sh1 + a.sh2]);
      for (var col = 1; col <= 4; col++) {
        var c = r.getCell(col); c.font = { name: 'Arial', size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREYF } };
        c.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' }; c.border = border;
      }
      r.getCell(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } };
    });

    var tr = ws.addRow(['TOTAL', summary.totSh1, summary.totSh2, summary.grand]);
    for (var tc2 = 1; tc2 <= 4; tc2++) { var t = tr.getCell(tc2); t.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; t.alignment = { horizontal: tc2 === 1 ? 'left' : 'center', vertical: 'middle' }; t.border = border; }

    var widths = [10, 11, 34, 12, 11, 11, 11, 15, 11, 13, 9, 26];
    for (var i = 0; i < 12; i++) ws.getColumn(i + 1).width = widths[i];
    return wb;
  }

  function loadExcelJS(cb) {
    if (window.ExcelJS) return cb();
    var s = document.createElement('script');
    s.src = '/assets/exceljs.min.js';
    s.onload = function () { cb(); };
    s.onerror = function () { cb('err'); };
    document.head.appendChild(s);
  }

  function download(btn) {
    var label = btn ? btn.textContent : null;
    if (btn) { btn.dataset.roLabel = label; btn.textContent = 'Preparing…'; btn.disabled = true; }
    function restore() { if (btn) { btn.textContent = btn.dataset.roLabel || label; btn.disabled = false; } }

    loadData().then(function (data) {
      var rows = buildRows(data);
      var summary = buildSummary(rows);
      loadExcelJS(function (err) {
        if (err || !window.ExcelJS) { restore(); alert('Could not load the export tool — please try again.'); return; }
        makeXlsx(rows, summary).xlsx.writeBuffer().then(function (buf) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          a.download = 'DEF-Gala-2026-Theatre-Run-of-Show.xlsx';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
          restore();
        }).catch(function () { restore(); alert('Export failed — please try again.'); });
      });
    }).catch(function () { restore(); alert('Could not load gala data for the export — please try again.'); });
  }

  window.GalaRunOfShow = { download: download, _buildRows: buildRows, _buildSummary: buildSummary };
})();
