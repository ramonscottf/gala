(function(){
  var SHOW_TIMES = {1:'Early · dinner 4:30 · movie 5:00', 2:'Late · dinner 7:15 · movie 7:50'};
  var TYPE_COLOR = { luxury:'#CB262C', standard:'#8b6f47', wheelchair:'#0d6efd', companion:'#6f42c1', loveseat:'#0dcaf0', dbox:'#f4b942' };
  var DINNER = { frenchdip:'Hot French Dip', salad:'Chicken Salad', veggie:'Vegetarian', kids:'Kids Meal' };

  var state = {
    layouts:null, theaterId:null, showing:1,
    assignBySeat:{}, holds:{},
    mode:'tap',                 // 'tap' | 'drag'
    selected:null,              // seat id selected as the SOURCE
    moving:false,               // in "pick destination" mode
  };

  var el = {
    audSel:document.getElementById('audSel'), showSel:document.getElementById('showSel'),
    search:document.getElementById('search'), map:document.getElementById('map'),
    side:document.getElementById('side'), audInfo:document.getElementById('audInfo'),
    legend:document.getElementById('legend'), toast:document.getElementById('toast'),
    modebar:document.getElementById('modebar'),
    modeTap:document.getElementById('modeTap'), modeDrag:document.getElementById('modeDrag'),
  };

  function toast(msg, kind){
    el.toast.textContent = msg; el.toast.className = 'toast show' + (kind?(' '+kind):'');
    clearTimeout(toast._t); toast._t = setTimeout(function(){ el.toast.className='toast'; }, 2600);
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  // Stable color per sponsor id (HSL spread) so a group reads as one block.
  function sponsorColor(id){
    if(id==null) return '#3a4488';
    var h=(Number(id)*47)%360;
    return 'hsl('+h+',52%,52%)';
  }

  function theater(){ return (state.layouts.theaters||[]).find(function(t){return t.id===state.theaterId;}); }

  async function loadLayouts(){
    var r = await fetch('/data/theater-layouts.json'); state.layouts = await r.json();
    var showing = (state.layouts.theaters||[]).filter(function(t){ return (t.totalSeats||0)>0; });
    el.audSel.innerHTML = showing.map(function(t){
      return '<option value="'+t.id+'">'+esc(t.name||('Aud '+t.id))+' · '+(t.totalSeats||0)+'</option>';
    }).join('');
    state.theaterId = showing.length ? showing[0].id : null;
    el.audSel.value = state.theaterId;
  }

  async function loadAssignments(){
    state.assignBySeat = {}; state.holds = {};
    var r = await fetch('/api/gala/admin/seatmap?theater_id='+state.theaterId+'&showing_number='+state.showing);
    if(!r.ok){ toast('Could not load assignments ('+r.status+')','err'); return; }
    var j = await r.json();
    (j.assignments||[]).forEach(function(a){ state.assignBySeat[a.seat]=a; });
    (j.holds||[]).forEach(function(s){ state.holds[s]=true; });
  }

  function clearTransient(){
    state.selected=null; state.moving=false;
    el.modebar.classList.remove('show');
    el.side.className='side empty';
    el.side.innerHTML="<div>Tap any seat to see who's there<br>and move them.</div>";
  }

  function render(){
    var t = theater(); if(!t){ el.map.innerHTML=''; return; }
    var placed = Object.keys(state.assignBySeat).length;
    el.audInfo.textContent = (t.name||('Aud '+t.id)) + ' · ' + SHOW_TIMES[state.showing] + ' · ' + placed + ' / ' + (t.totalSeats||0) + ' seated';
    var minCol=t.minCol, maxCol=t.maxCol;
    var html='';
    (t.rows||[]).forEach(function(row){
      html += '<div class="seatrow"><span class="rowlab">'+esc(row.label)+'</span>';
      // map col->seatNumber for this row
      var colToNum={}; (row.cols||[]).forEach(function(c,i){ colToNum[c]=row.numbers[i]; });
      for(var c=minCol;c<=maxCol;c++){
        if(!(c in colToNum)){ html+='<div class="seat gap"></div>'; continue; }
        var num=colToNum[c]; var id=row.label+num;
        var a=state.assignBySeat[id]; var held=state.holds[id];
        var cls='seat'; var bg=''; var title='';
        if(a){
          cls+=' assigned';
          bg='background:'+sponsorColor(a.sponsor_id)+';border-color:rgba(0,0,0,.25);';
          title=id+' — '+(a.company||a.guest_name||'sponsor '+a.sponsor_id)+(a.dinner?(' · '+(DINNER[a.dinner]||a.dinner)):'');
        } else {
          // Open seat: keep it quiet. A thin type-tinted left edge hints at
          // seat type (luxury/wheelchair/etc.) without shouting over the
          // assigned blocks, which are the thing the admin is scanning for.
          var tc=TYPE_COLOR[row.type];
          if(tc && row.type!=='standard'){ bg='border-left:3px solid '+tc+';'; }
          title=id+' — open ('+(row.type||'standard')+')';
        }
        if(held) cls+=' held';
        html += '<div class="'+cls+'" data-seat="'+id+'" data-row="'+esc(row.label)+'" data-num="'+num+'" '
              + 'style="'+bg+'" title="'+esc(title)+'" '
              + (state.mode==='drag'&&a?'draggable="true" ':'')
              + '>'+num+'</div>';
      }
      html+='</div>';
    });
    el.map.innerHTML=html;
    applySelectionClasses();
  }

  function applySelectionClasses(){
    var seats=el.map.querySelectorAll('.seat');
    Array.prototype.forEach.call(seats,function(s){
      s.classList.remove('selected','target-ok','dimmed','hot');
      var id=s.getAttribute('data-seat');
      if(state.moving){
        if(id===state.selected){ s.classList.add('selected'); }
        else if(!s.classList.contains('assigned') && !s.classList.contains('gap')){ s.classList.add('target-ok'); }
        else if(!s.classList.contains('gap')){ s.classList.add('dimmed'); }
      } else if(id===state.selected){ s.classList.add('selected'); }
    });
  }

  // ── side panel ──
  function openSide(id){
    var a=state.assignBySeat[id];
    el.side.className='side open';
    if(!a){
      el.side.innerHTML='<div class="side-h"><div class="eyebrow">Open seat</div>'
        +'<div class="seatbig">'+esc(id)+'</div><div class="who">No one is seated here.</div></div>'
        +'<div class="side-b"><p class="instr">Pick an <b>occupied</b> seat to move someone into this spot.</p></div>'
        +'<div class="actions"><button class="btn cancel" id="closeSide">Close</button></div>';
      document.getElementById('closeSide').onclick=clearTransient;
      return;
    }
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">'+esc(a.company?'Sponsor':'Guest')+'</div>'
      +'<div class="seatbig">'+esc(id)+'</div>'
      +'<div class="who">'+esc(a.company||a.guest_name||('sponsor '+a.sponsor_id))+'</div>'
      +(a.dinner?'<div class="dinner">'+esc(DINNER[a.dinner]||a.dinner)+'</div>':'')
      +'</div>'
      +'<div class="side-b"><p class="instr">Move this seat to an open spot — or onto another occupied seat to <b>swap</b> them. The dinner choice travels with the seat.</p></div>'
      +'<div class="actions"><button class="btn move" id="startMove">Move '+esc(id)+' →</button>'
      +'<button class="btn cancel" id="closeSide">Close</button></div>';
    document.getElementById('startMove').onclick=function(){ startMove(id); };
    document.getElementById('closeSide').onclick=clearTransient;
  }

  function startMove(id){
    state.selected=id; state.moving=true;
    el.modebar.classList.add('show');
    var a=state.assignBySeat[id];
    el.side.className='side open';
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">Moving</div>'
      +'<div class="seatbig">'+esc(id)+'</div>'
      +'<div class="who">'+esc(a.company||a.guest_name||'')+'</div></div>'
      +'<div class="side-b"><p class="instr">Now tap the <b>destination</b> seat.<br>Green = open. Tap an occupied seat to swap.</p></div>'
      +'<div class="actions"><button class="btn cancel" id="cancelMove">Cancel</button></div>';
    document.getElementById('cancelMove').onclick=clearTransient;
    applySelectionClasses();
  }

  async function commitMove(fromId, toId){
    var fa=state.assignBySeat[fromId]; var ta=state.assignBySeat[toId];
    var from={row_label:fa.row,seat_num:fa.num};
    var to;
    if(ta){ to={row_label:ta.row,seat_num:ta.num}; }
    else {
      var cell=el.map.querySelector('.seat[data-seat="'+toId+'"]');
      to={row_label:cell.getAttribute('data-row'),seat_num:cell.getAttribute('data-num')};
    }
    toast('Moving '+fromId+' → '+toId+'…');
    try{
      var r=await fetch('/api/gala/admin/move-seat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({theater_id:state.theaterId,showing_number:state.showing,from:from,to:to})});
      var j=await r.json();
      if(!r.ok){ toast(j.error||('Move failed ('+r.status+')'),'err'); return; }
      await loadAssignments(); clearTransient(); render();
      toast(j.kind==='swap'?('Swapped '+j.a+' ↔ '+j.b):('Moved to '+toId),'ok');
    }catch(e){ toast('Network error — try again','err'); }
  }

  // ── seat click (event delegation) ──
  el.map.addEventListener('click',function(e){
    var cell=e.target.closest('.seat'); if(!cell||cell.classList.contains('gap')) return;
    var id=cell.getAttribute('data-seat');
    if(state.moving && state.selected){
      if(id===state.selected){ clearTransient(); render(); return; }
      commitMove(state.selected,id); return;
    }
    state.selected=id; applySelectionClasses(); openSide(id);
  });

  // ── search ──
  el.search.addEventListener('input',function(){
    var q=el.search.value.trim().toLowerCase();
    var seats=el.map.querySelectorAll('.seat'); var firstHit=null;
    Array.prototype.forEach.call(seats,function(s){
      s.classList.remove('hot');
      if(!q) return;
      var id=s.getAttribute('data-seat'); var a=state.assignBySeat[id];
      if(a){ var hay=((a.company||'')+' '+(a.guest_name||'')).toLowerCase();
        if(hay.indexOf(q)>=0){ s.classList.add('hot'); if(!firstHit) firstHit=s; } }
    });
    if(firstHit) firstHit.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});
  });

  // ── mode toggle ──
  function setMode(m){
    state.mode=m;
    el.modeTap.setAttribute('aria-pressed', m==='tap');
    el.modeDrag.setAttribute('aria-pressed', m==='drag');
    clearTransient(); render();
    toast(m==='drag'?'Drag mode: drag a person onto a seat':'Tap mode: tap a seat, then tap where to move');
  }
  el.modeTap.onclick=function(){ setMode('tap'); };
  el.modeDrag.onclick=function(){ setMode('drag'); };

  // ── drag and drop ──
  el.map.addEventListener('dragstart',function(e){
    var cell=e.target.closest('.seat'); if(!cell||!cell.classList.contains('assigned')||state.mode!=='drag') return;
    e.dataTransfer.setData('text/plain',cell.getAttribute('data-seat'));
    e.dataTransfer.effectAllowed='move';
  });
  el.map.addEventListener('dragover',function(e){
    var cell=e.target.closest('.seat'); if(!cell||cell.classList.contains('gap')) return;
    e.preventDefault(); cell.classList.add('dragover');
  });
  el.map.addEventListener('dragleave',function(e){
    var cell=e.target.closest('.seat'); if(cell) cell.classList.remove('dragover');
  });
  el.map.addEventListener('drop',function(e){
    var cell=e.target.closest('.seat'); if(!cell||cell.classList.contains('gap')) return;
    e.preventDefault(); cell.classList.remove('dragover');
    var fromId=e.dataTransfer.getData('text/plain'); var toId=cell.getAttribute('data-seat');
    if(fromId && toId && fromId!==toId) commitMove(fromId,toId);
  });

  // ── legend ──
  function renderLegend(){
    el.legend.innerHTML =
      '<span><span class="sw" style="background:#3a4488"></span>Open</span>'
      +'<span><span class="sw" style="background:hsl(120,52%,52%)"></span>Seated (color = sponsor)</span>'
      +'<span><span class="sw" style="background:transparent;border:2px dashed #f4b942"></span>Being held</span>'
      +'<span><span class="sw" style="box-shadow:0 0 0 2px #62c8ff"></span>Search match</span>';
  }

  // ── selectors ──
  el.audSel.onchange=async function(){ state.theaterId=Number(el.audSel.value); clearTransient(); await loadAssignments(); render(); };
  el.showSel.onchange=async function(){ state.showing=Number(el.showSel.value); clearTransient(); await loadAssignments(); render(); };

  // ── boot ──
  (async function(){
    try{
      await loadLayouts(); await loadAssignments(); renderLegend(); render();
    }catch(e){ toast('Failed to load — are you signed in to admin?','err'); }
  })();
})();
