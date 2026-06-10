// SeatMini — tiny dependency-free seat-map renderer (SVG) shared by the
// guest /checkin "your seats" view and the greeter /rooms pages.
// Reads the same /data/theater-layouts.json geometry the React SeatEngine
// uses, so the picture matches the portal exactly.
//
// API:
//   SeatMini.load()                          -> Promise<layouts>
//   SeatMini.theater(layouts, id)            -> theater or null
//   SeatMini.render(el, theater, opts)
//     opts.highlight  Set('D7','D8')  gold "your seats"
//     opts.occupied   Set('A1',...)   muted filled (someone sits here)
//     opts.names      Map seat->label tooltip text (greeter view)
//     opts.cell       px per seat (default 24)
//     opts.showNumbers boolean — numbers inside every seat (greeter view)
(function () {
  const GOLD = '#ffc24d', INK = '#0b1233';
  const OPEN_STROKE = 'rgba(255,255,255,0.22)';
  const TAKEN_FILL = 'rgba(255,255,255,0.24)';

  async function load() {
    const r = await fetch('/data/theater-layouts.json');
    if (!r.ok) throw new Error('layouts ' + r.status);
    return r.json();
  }
  function theater(layouts, id) {
    return (layouts.theaters || []).find((t) => Number(t.id) === Number(id)) || null;
  }

  function render(el, th, opts) {
    opts = opts || {};
    const cell = opts.cell || 24, gap = 4, pad = 10, labelW = 22;
    const hi = opts.highlight || new Set();
    const occ = opts.occupied || new Set();
    const names = opts.names || null;
    const minCol = th.minCol, maxCol = th.maxCol;
    const cols = maxCol - minCol + 1;
    const W = pad * 2 + labelW + cols * (cell + gap);
    const rowsArr = th.rows || [];
    const screenH = 16;
    const H = pad * 2 + screenH + 14 + rowsArr.length * (cell + gap);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = W + 'px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';

    // Screen bar
    const sc = document.createElementNS(ns, 'rect');
    sc.setAttribute('x', pad + labelW); sc.setAttribute('y', pad);
    sc.setAttribute('width', cols * (cell + gap) - gap); sc.setAttribute('height', 6);
    sc.setAttribute('rx', 3); sc.setAttribute('fill', 'rgba(255,255,255,0.30)');
    svg.appendChild(sc);
    const st = document.createElementNS(ns, 'text');
    st.setAttribute('x', W / 2); st.setAttribute('y', pad + screenH + 2);
    st.setAttribute('text-anchor', 'middle'); st.setAttribute('font-size', '9');
    st.setAttribute('fill', 'rgba(255,255,255,0.5)');
    st.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    st.setAttribute('letter-spacing', '2'); st.textContent = 'SCREEN';
    svg.appendChild(st);

    rowsArr.forEach((row, ri) => {
      const y = pad + screenH + 14 + ri * (cell + gap);
      const lab = document.createElementNS(ns, 'text');
      lab.setAttribute('x', pad + labelW - 8); lab.setAttribute('y', y + cell / 2 + 4);
      lab.setAttribute('text-anchor', 'end'); lab.setAttribute('font-size', '11');
      lab.setAttribute('font-weight', '700'); lab.setAttribute('fill', 'rgba(255,255,255,0.55)');
      lab.setAttribute('font-family', 'Inter, system-ui, sans-serif');
      lab.textContent = row.label;
      svg.appendChild(lab);

      // Rows come in two shapes: simple {numbers, cols} or mixed
      // {segments:[{seats, cols, type}]} (wheelchair / companion / loveseat
      // rows). Flatten both into (num, col) pairs so no seat goes missing.
      const pairs = [];
      if (row.numbers) {
        row.numbers.forEach((num, i) => pairs.push([num, row.cols[i]]));
      } else if (row.segments) {
        row.segments.forEach((seg) => (seg.seats || []).forEach((num, i) => pairs.push([num, seg.cols[i]])));
      }

      pairs.forEach(([num, col]) => {
        const x = pad + labelW + (col - minCol) * (cell + gap);
        const id = `${row.label}${num}`;
        const isHi = hi.has(id), isOcc = occ.has(id);
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', cell); r.setAttribute('height', cell);
        r.setAttribute('rx', 6);
        r.setAttribute('data-seat', id);
        if (isOcc || isHi) r.style.cursor = 'pointer';
        if (isHi) { r.setAttribute('fill', GOLD); }
        else if (isOcc) { r.setAttribute('fill', TAKEN_FILL); }
        else { r.setAttribute('fill', 'transparent'); r.setAttribute('stroke', OPEN_STROKE); r.setAttribute('stroke-width', '1.4'); }
        if (names && names.has(id)) {
          const tip = document.createElementNS(ns, 'title');
          tip.textContent = `${id} — ${names.get(id)}`;
          r.appendChild(tip);
        }
        svg.appendChild(r);
        if (isHi || opts.showNumbers) {
          const t = document.createElementNS(ns, 'text');
          t.setAttribute('x', x + cell / 2); t.setAttribute('y', y + cell / 2 + 3.5);
          t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '9.5');
          t.setAttribute('font-weight', '800');
          t.setAttribute('fill', isHi ? INK : 'rgba(255,255,255,0.55)');
          t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
          t.textContent = num;
          svg.appendChild(t);
        }
      });
    });

    el.innerHTML = '';
    el.appendChild(svg);
  }

  window.SeatMini = { load, theater, render };
})();
