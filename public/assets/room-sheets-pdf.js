/* ════════════════════════════════════════════════════════════════════════
 * DEF Gala 2026 — Room Sheets PDF (shared module)
 * ------------------------------------------------------------------------
 * One downloadable PDF: per auditorium × showing, a to-scale seat map (assigned
 * seats highlighted) + a guest list with each guest's seat and dinner choice.
 * Built for the night-of auditorium ambassadors.
 *
 * Sources (same-origin; the seating list is admin-gated, so this button lives
 * only on authenticated admin pages):
 *   /data/theater-layouts.json   → room grids
 *   /api/gala/movies             → movie / showtime / dinner per aud:showing
 *   /api/gala/seating            → { assignments:[ {theater_id, showing_number,
 *                                     row_label, seat_num, guest_name, dinner_choice} ] }
 *
 * Usage:  window.GalaRoomSheets.download(buttonEl)
 * Libs lazy-loaded from /assets/: jspdf.umd.min.js + jspdf.plugin.autotable.min.js
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── pure builder (verified by offline render before ship) ──
  function buildDoc(jsPDFCtor, data) {
    var NAVY = [13, 27, 61], GREEN = [22, 163, 74], GREY = [150, 162, 184],
        MUT = [68, 80, 107], WHITE = [255, 255, 255];
    var layouts = {}; (data.layouts || []).forEach(function (t) { layouts[t.id] = t; });
    var stMap = {}; (data.showtimes || []).forEach(function (s) { stMap[s.theater_id + ':' + s.showing_number] = s; });

    var byRoom = {};
    (data.assignments || []).forEach(function (a) {
      var aud = a.theater_id, sh = a.showing_number;
      (byRoom[aud] = byRoom[aud] || {});
      (byRoom[aud][sh] = byRoom[aud][sh] || {});
      byRoom[aud][sh][String(a.row_label) + String(a.seat_num)] = {
        name: a.guest_name || '', dinner: a.dinner_choice || '', row: String(a.row_label), num: String(a.seat_num)
      };
    });

    var DINNER = { salad: 'Salad', frenchdip: 'French Dip', veggie: 'Veggie', gf: 'GF', none: '—' };
    function dinnerLabel(d) { return DINNER[String(d || '').toLowerCase()] || (d ? d : '—'); }

    var doc = new jsPDFCtor({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var M = 40, CW = PW - 2 * M;

    function rowCells(r) {
      var cells = {};
      if (r.segments) r.segments.forEach(function (sg) { (sg.seats || []).forEach(function (num, i) { cells[sg.cols[i]] = num; }); });
      else if (r.numbers) r.numbers.forEach(function (num, i) { cells[r.cols[i]] = num; });
      return cells;
    }

    var firstPage = true;
    var auds = Object.keys(layouts).map(Number).sort(function (a, b) { return a - b; });

    auds.forEach(function (aud) {
      var lay = layouts[aud];
      var shset = [];
      [1, 2].forEach(function (sh) { if (stMap[aud + ':' + sh] || (byRoom[aud] && byRoom[aud][sh])) shset.push(sh); });
      if (shset.length === 0) shset.push(1);

      shset.sort().forEach(function (sh) {
        if (!firstPage) doc.addPage();
        firstPage = false;

        var st = stMap[aud + ':' + sh] || {};
        var occ = (byRoom[aud] && byRoom[aud][sh]) || {};
        var guests = Object.keys(occ).length;
        var cap = lay.totalSeats || 0;

        // header
        doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(M, M, CW, 30, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text('Auditorium ' + aud, M + 10, M + 20);
        doc.setFontSize(11); doc.setFont('helvetica', 'normal');
        doc.text(guests + ' / ' + cap + ' seats' + (cap ? '  (' + Math.round(guests / cap * 100) + '%)' : ''), PW - M - 10, M + 20, { align: 'right' });

        doc.setTextColor(MUT[0], MUT[1], MUT[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        var movie = st.movie_title || '\u2014 Flex / hold (no film) \u2014';
        var sub = 'Showing ' + sh + '   \u00b7   ' + movie + (st.show_start ? '   \u00b7   ' + st.show_start : '') + (st.dinner_time ? '   \u00b7   Dinner ' + st.dinner_time : '');
        doc.text(sub, M, M + 46);

        // seat map
        var cols = lay.maxCol - lay.minCol + 1, nRows = (lay.rows || []).length;
        var mapTop = M + 60, screenH = 12, gap = 2;
        var cell = Math.min((CW - (cols - 1) * gap) / cols, 22); cell = Math.max(cell, 9);
        var mapW = cols * cell + (cols - 1) * gap, mapX = M + (CW - mapW) / 2;

        doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.roundedRect(mapX + mapW * 0.15, mapTop, mapW * 0.7, 3, 1.5, 1.5, 'F');
        doc.setTextColor(MUT[0], MUT[1], MUT[2]); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
        doc.text('S C R E E N', mapX + mapW / 2, mapTop + screenH - 1, { align: 'center' });

        var gridTop = mapTop + screenH + 4;
        (lay.rows || []).forEach(function (r, ri) {
          var cells = rowCells(r), y = gridTop + ri * (cell + gap);
          doc.setTextColor(MUT[0], MUT[1], MUT[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.min(cell * 0.5, 8));
          doc.text(String(r.label), mapX - 6, y + cell * 0.68, { align: 'right' });
          doc.text(String(r.label), mapX + mapW + 6, y + cell * 0.68);
          for (var c = lay.minCol; c <= lay.maxCol; c++) {
            var num = cells[c]; if (num == null) continue;
            var x = mapX + (c - lay.minCol) * (cell + gap), taken = !!occ[String(r.label) + String(num)];
            if (taken) { doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]); doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); }
            else { doc.setFillColor(255, 255, 255); doc.setDrawColor(GREY[0], GREY[1], GREY[2]); }
            doc.roundedRect(x, y, cell, cell, 2, 2, 'FD');
            doc.setFontSize(Math.min(cell * 0.42, 6.5)); doc.setFont('helvetica', 'normal');
            if (taken) doc.setTextColor(255, 255, 255); else doc.setTextColor(GREY[0], GREY[1], GREY[2]);
            doc.text(String(num), x + cell / 2, y + cell * 0.66, { align: 'center' });
          }
        });

        var mapBottom = gridTop + nRows * (cell + gap) + 6;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]); doc.roundedRect(mapX, mapBottom, 9, 9, 1.5, 1.5, 'F');
        doc.setTextColor(MUT[0], MUT[1], MUT[2]); doc.text('Assigned', mapX + 13, mapBottom + 7.5);
        doc.setFillColor(255, 255, 255); doc.setDrawColor(GREY[0], GREY[1], GREY[2]); doc.roundedRect(mapX + 70, mapBottom, 9, 9, 1.5, 1.5, 'FD');
        doc.text('Open', mapX + 83, mapBottom + 7.5);

        // guest list
        var list = Object.keys(occ).map(function (k) { return occ[k]; }).sort(function (a, b) {
          return a.row === b.row ? (parseInt(a.num, 10) - parseInt(b.num, 10)) : (a.row < b.row ? -1 : 1);
        });
        var body = list.map(function (g) { return [g.row + g.num, g.name, dinnerLabel(g.dinner)]; });
        var listTop = mapBottom + 22;
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text('Guest List \u2014 ' + guests + (guests === 1 ? ' guest' : ' guests'), M, listTop);

        if (body.length) {
          doc.autoTable({
            startY: listTop + 6,
            head: [['Seat', 'Guest', 'Dinner']],
            body: body,
            margin: { left: M, right: M },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, lineColor: [201, 210, 227], lineWidth: 0.5, textColor: [30, 41, 59] },
            headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
            alternateRowStyles: { fillColor: [247, 249, 252] },
            columnStyles: { 0: { cellWidth: 52, halign: 'center', fontStyle: 'bold' }, 2: { cellWidth: 80, halign: 'center' } },
            didDrawPage: function () {
              doc.setFontSize(8); doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.setFont('helvetica', 'normal');
              doc.text('Aud ' + aud + ' \u00b7 Showing ' + sh, M, PH - 22);
              doc.text('DEF Gala 2026 \u00b7 Room Sheets \u00b7 ' + new Date().toLocaleString(), PW - M, PH - 22, { align: 'right' });
            }
          });
        } else {
          doc.setTextColor(GREY[0], GREY[1], GREY[2]); doc.setFont('helvetica', 'italic'); doc.setFontSize(10);
          doc.text('No guests assigned to this showing yet.', M, listTop + 22);
        }
      });
    });

    doc.setProperties({ title: 'DEF Gala 2026 \u2014 Room Sheets', subject: 'Per-auditorium seat maps & guest lists' });
    return doc;
  }

  // ── browser plumbing ──
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureLibs() {
    var have = window.jspdf && window.jspdf.jsPDF;
    var p = have ? Promise.resolve() : loadScript('/assets/jspdf.umd.min.js');
    return p.then(function () {
      var doc = new window.jspdf.jsPDF();
      if (typeof doc.autoTable === 'function') return;
      return loadScript('/assets/jspdf.plugin.autotable.min.js');
    });
  }
  function loadData() {
    return Promise.all([
      fetch('/data/theater-layouts.json').then(function (r) { return r.json(); }),
      fetch('/api/gala/movies').then(function (r) { return r.json(); }).catch(function () { return { showtimes: [] }; }),
      fetch('/api/gala/seating', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
    ]).then(function (res) {
      return {
        layouts: res[0].theaters || [],
        showtimes: res[1].showtimes || [],
        assignments: (res[2] && res[2].assignments) || []
      };
    });
  }

  function download(btn) {
    var label = btn ? btn.textContent : null;
    if (btn) { btn.dataset.rsLabel = label; btn.textContent = 'Building PDF\u2026'; btn.disabled = true; }
    function restore() { if (btn) { btn.textContent = btn.dataset.rsLabel || label; btn.disabled = false; } }

    ensureLibs().then(function () {
      return loadData().then(function (data) {
        var doc = buildDoc(window.jspdf.jsPDF, data);
        doc.save('DEF-Gala-2026-Room-Sheets.pdf');
        restore();
      });
    }).catch(function (e) {
      restore();
      alert('Could not build the room sheets PDF \u2014 please refresh and try again.\n(' + (e && e.message ? e.message : 'unknown error') + ')');
    });
  }

  window.GalaRoomSheets = { download: download, _buildDoc: buildDoc };
})();
