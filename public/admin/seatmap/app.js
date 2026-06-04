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
    movingGroup:null,           // [{seat,row,num}] when relocating a whole party
  };

  var el = {
    audSel:document.getElementById('audSel'), showSel:document.getElementById('showSel'),
    search:document.getElementById('search'), map:document.getElementById('map'),
    side:document.getElementById('side'), audInfo:document.getElementById('audInfo'),
    legend:document.getElementById('legend'), toast:document.getElementById('toast'),
    modebar:document.getElementById('modebar'),
    modeTap:document.getElementById('modeTap'), modeDrag:document.getElementById('modeDrag'),
    allBtn:document.getElementById('allBtn'),
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
    state.selected=null; state.moving=false; state.movingGroup=null;
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
          // Open seat: keep it quiet. Only accessibility-relevant types
          // (wheelchair/companion/loveseat) get a tinted left edge so they
          // stand out; luxury/dbox/standard are the bulk and stay neutral
          // so the colored assigned seats are the only thing that pops.
          var ACCESS={wheelchair:1,companion:1,loveseat:1};
          var tc=TYPE_COLOR[row.type];
          if(tc && ACCESS[row.type]){ bg='border-left:3px solid '+tc+';'; }
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
        var inGroup = state.movingGroup && state.movingGroup.some(function(p){return p.seat===id;});
        if(id===state.selected || inGroup){ s.classList.add('selected'); }
        else if(!s.classList.contains('assigned') && !s.classList.contains('gap')){ s.classList.add('target-ok'); }
        else if(!s.classList.contains('gap')){ s.classList.add('dimmed'); }
      } else if(id===state.selected){ s.classList.add('selected'); }
    });
  }

  // ── side panel ──
  // ── side panel: SPONSOR DOSSIER ──
  // Tapping an occupied seat loads the whole sponsor (every seat across
  // every auditorium + their guests), not just the one seat. `focusSeat`
  // is the seat that was tapped — highlighted, and the default move source.
  async function openSide(id){
    var a=state.assignBySeat[id];
    el.side.className='side open';
    if(!a){
      el.side.innerHTML='<div class="side-h"><div class="eyebrow">Open seat</div>'
        +'<div class="seatbig">'+esc(id)+'</div><div class="who">No one is seated here.</div></div>'
        +'<div class="side-b"><p class="instr">Tap an <b>occupied</b> seat to see that sponsor and move someone here.</p></div>'
        +'<div class="actions"><button class="btn cancel" id="closeSide">Close</button></div>';
      document.getElementById('closeSide').onclick=clearTransient;
      return;
    }
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">Loading…</div>'
      +'<div class="seatbig">'+esc(id)+'</div></div>';
    if(a.sponsor_id) renderDossier(a.sponsor_id, id);
    else openSeatOnly(id, a);
  }

  // Fallback when a seat has no sponsor_id (rare).
  function openSeatOnly(id, a){
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">Guest</div>'
      +'<div class="seatbig">'+esc(id)+'</div><div class="who">'+esc(a.guest_name||'')+'</div>'
      +(a.dinner?'<div class="dinner">'+esc(DINNER[a.dinner]||a.dinner)+'</div>':'')+'</div>'
      +'<div class="side-b"><p class="instr">Move this seat, or tap another occupied seat to swap.</p></div>'
      +'<div class="actions"><button class="btn move" id="startMove">Move '+esc(id)+' →</button>'
      +'<button class="btn cancel" id="closeSide">Close</button></div>';
    document.getElementById('startMove').onclick=function(){ startMove(id); };
    document.getElementById('closeSide').onclick=clearTransient;
  }

  async function renderDossier(sponsorId, focusSeat){
    var d;
    try{
      var r=await fetch('/api/gala/admin/sponsor?id='+sponsorId);
      d=await r.json();
      if(!r.ok||!d.sponsor) throw new Error();
    }catch(e){
      var a=state.assignBySeat[focusSeat]; openSeatOnly(focusSeat,a||{}); return;
    }
    var s=d.sponsor;
    // Header
    var html='<div class="side-h"><div class="eyebrow">'+esc(s.tier||'Sponsor')+'</div>'
      +'<div class="seatbig" style="font-size:23px;line-height:1.15;">'+esc(s.company)+'</div>'
      +'<div class="who">'+esc([s.contact,s.email].filter(Boolean).join(' · '))
      +(s.phone?(' · '+esc(s.phone)):'')+'</div>'
      +'<div class="who" style="margin-top:6px;color:#fff;">'
        +'<b>'+d.placed+'</b> of <b>'+s.purchased+'</b> seats placed'
        +(d.guest_placed?(' · '+d.guest_placed+' for guests'):'')+'</div>'
      +'<div style="margin-top:9px;"><a href="/admin/sponsor-seating/?sponsor='+sponsorId+'" style="display:inline-block;background:#4f86ff;color:#fff;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Edit all seats · every theater →</a></div>'
      +'</div>';
    // Body: seats grouped by auditorium+showing
    html+='<div class="side-b">';
    if(!d.groups.length){
      html+='<p class="instr">No seats placed yet for this sponsor.</p>';
    } else {
      d.groups.forEach(function(g){
        var here = (g.theater_id===state.theaterId && g.showing_number===state.showing);
        html+='<div class="dgroup">'
          +'<div class="dgroup-h">'+esc(g.movie_title)+'<span class="dgroup-sub">Aud '+g.theater_id
            +' · '+(g.showing_number===1?'Early':'Late')+(g.show_start?(' · '+esc(g.show_start)):'')
            +(here?'':' · tap to jump')+'</span></div>';
        g.seats.forEach(function(st){
          var isFocus = here && st.seat===focusSeat;
          html+='<button class="dseat'+(isFocus?' focus':'')+'" '
            +'data-aud="'+g.theater_id+'" data-show="'+g.showing_number+'" data-seat="'+esc(st.seat)+'">'
            +'<span class="dseat-id">'+esc(st.seat)+'</span>'
            +'<span class="dseat-meta">'+esc(st.dinner_label||'no dinner')
            +(st.owner!=='Sponsor'?(' · '+esc(st.owner)):'')+'</span></button>';
        });
        html+='</div>';
      });
    }
    // Guests
    if(d.delegates&&d.delegates.length){
      html+='<div class="dgroup"><div class="dgroup-h">Invited guests<span class="dgroup-sub">'+d.delegates.length+'</span></div>';
      d.delegates.forEach(function(g){
        html+='<div class="dguest"><span>'+esc(g.name)+'</span>'
          +'<span class="dseat-meta">'+g.placed+'/'+g.allocated+' seats · '+esc(g.status)+'</span></div>';
      });
      html+='</div>';
    }
    html+='</div>';
    // Action: move the focused seat (only when a specific seat is in focus)
    if(focusSeat){
      var _party=partyOf(focusSeat);
      var _groupBtn = _party.length>1
        ? '<button class="btn move" id="startGroupMove" style="background:#0d6efd;border-color:#0d6efd;">Move whole party ('+_party.length+') →</button>'
        : '';
      html+='<div class="actions">'
        +'<button class="btn move" id="startMove">Move '+esc(focusSeat)+' →</button>'
        +_groupBtn
        +'<button class="btn cancel" id="closeSide">Close</button></div>';
    } else {
      html+='<div class="actions"><p class="instr" style="margin:0 0 4px;">Tap any seat above to jump to it and move it.</p>'
        +'<button class="btn cancel" id="closeSide">Close</button></div>';
    }
    el.side.className='side open';
    el.side.innerHTML=html;

    // Wire: tap any dossier seat -> jump to its auditorium + select it
    Array.prototype.forEach.call(el.side.querySelectorAll('.dseat'),function(btn){
      btn.onclick=function(){
        var aud=Number(btn.getAttribute('data-aud')), show=Number(btn.getAttribute('data-show')), seat=btn.getAttribute('data-seat');
        jumpToSeat(aud,show,seat);
      };
    });
    var sm=document.getElementById('startMove');
    if(sm) sm.onclick=function(){ startMove(focusSeat); };
    var sgm=document.getElementById('startGroupMove');
    if(sgm) sgm.onclick=function(){ startGroupMove(focusSeat); };
    document.getElementById('closeSide').onclick=clearTransient;
  }

  // Switch the map to a given auditorium+showing and select a seat there.
  async function jumpToSeat(aud, show, seat){
    if(aud!==state.theaterId || show!==state.showing){
      state.theaterId=aud; state.showing=show;
      el.audSel.value=String(aud); el.showSel.value=String(show);
      await loadAssignments(); render();
    }
    state.selected=seat; applySelectionClasses();
    var cell=el.map.querySelector('.seat[data-seat="'+seat+'"]');
    if(cell) cell.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});
    var a=state.assignBySeat[seat];
    if(a&&a.sponsor_id) renderDossier(a.sponsor_id, seat);
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

  // ── group move: relocate a whole party (same sponsor + delegation) ──
  function partyOf(focusSeat){
    var a=state.assignBySeat[focusSeat]; if(!a) return [];
    var key=a.sponsor_id+'|'+(a.delegation_id==null?'direct':a.delegation_id);
    var out=[];
    Object.keys(state.assignBySeat).forEach(function(id){
      var x=state.assignBySeat[id];
      var k=x.sponsor_id+'|'+(x.delegation_id==null?'direct':x.delegation_id);
      if(k===key) out.push({seat:id,row:x.row,num:x.num});
    });
    out.sort(function(p,q){ return p.row===q.row ? (Number(p.num)-Number(q.num)) : (p.row<q.row?-1:1); });
    return out;
  }

  function startGroupMove(focusSeat){
    var party=partyOf(focusSeat);
    if(party.length<2){ startMove(focusSeat); return; }
    state.selected=focusSeat; state.moving=true; state.movingGroup=party;
    el.modebar.classList.add('show');
    var a=state.assignBySeat[focusSeat];
    var labels=party.map(function(p){return p.seat;}).join(', ');
    el.side.className='side open';
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">Moving whole party · '+party.length+' seats</div>'
      +'<div class="seatbig" style="font-size:17px;line-height:1.25;">'+esc(labels)+'</div>'
      +'<div class="who">'+esc(a.company||a.guest_name||'')+'</div></div>'
      +'<div class="side-b"><p class="instr">Tap the <b>left-most seat</b> of where you want them. '
      +'I\'ll keep all '+party.length+' together in that row.</p></div>'
      +'<div class="actions"><button class="btn cancel" id="cancelMove">Cancel</button></div>';
    document.getElementById('cancelMove').onclick=clearTransient;
    applySelectionClasses();
  }

  // From a tapped anchor seat, find a contiguous N-seat block in that row
  // (open seats, or seats the party already holds), then move the party there.
  async function commitGroupMove(anchorId){
    var party=state.movingGroup; var N=party.length;
    var t=theater(); if(!t){ toast('No layout loaded','err'); return; }
    var cell=el.map.querySelector('.seat[data-seat="'+anchorId+'"]');
    if(!cell){ return; }
    var rowLabel=cell.getAttribute('data-row');
    var row=(t.rows||[]).find(function(r){return r.label===rowLabel;});
    if(!row){ toast('Pick a seat in a seating row','err'); return; }
    var nums=(row.numbers||[]).map(String);
    var ownSeats={}; party.forEach(function(p){ ownSeats[p.row+p.num]=true; });
    function blockAt(startIdx){
      if(startIdx<0 || startIdx+N>nums.length) return null;
      var ids=[];
      for(var i=0;i<N;i++){
        var id=rowLabel+nums[startIdx+i];
        var taken = state.assignBySeat[id] && !ownSeats[id];
        var held = state.holds[id] && !ownSeats[id];
        if(taken||held) return null;
        ids.push({row:rowLabel,num:nums[startIdx+i],seat:id});
      }
      return ids;
    }
    var anchorIdx=nums.indexOf(String(cell.getAttribute('data-num')));
    if(anchorIdx<0){ toast('Pick a seat in a seating row','err'); return; }
    var block=null;
    for(var s=anchorIdx;s>=0 && !block;s--){ block=blockAt(s); }
    if(!block){ for(var s2=anchorIdx+1;s2+N<=nums.length && !block;s2++){ block=blockAt(s2); } }
    if(!block){ toast('No open '+N+'-seat block in row '+rowLabel+' — try another spot','err'); return; }
    var moves=[];
    for(var k=0;k<N;k++){
      moves.push({from:{row_label:party[k].row,seat_num:String(party[k].num)},
                  to:{row_label:block[k].row,seat_num:block[k].num}});
    }
    toast('Moving '+N+' seats…');
    try{
      var r=await fetch('/api/gala/admin/move-group',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({theater_id:state.theaterId,showing_number:state.showing,moves:moves})});
      var j=await r.json();
      if(!r.ok){ toast(j.error||('Move failed ('+r.status+')'),'err'); return; }
      await loadAssignments(); clearTransient(); render();
      toast('Moved party of '+N+' to '+block[0].seat+'–'+block[N-1].seat,'ok');
    }catch(e){ toast('Network error — try again','err'); }
  }

  // ── seat click (event delegation) ──
  el.map.addEventListener('click',function(e){
    var cell=e.target.closest('.seat'); if(!cell||cell.classList.contains('gap')) return;
    var id=cell.getAttribute('data-seat');
    if(state.moving && state.movingGroup){
      commitGroupMove(id); return;
    }
    if(state.moving && state.selected){
      if(id===state.selected){ clearTransient(); render(); return; }
      commitMove(state.selected,id); return;
    }
    state.selected=id; applySelectionClasses(); openSide(id);
  });

  // ── search: find sponsors, list them, open a dossier ──
  var searchT=null;
  el.search.addEventListener('input',function(){
    var q=el.search.value.trim();
    // Always also highlight matches in the current map view (quick visual).
    var seats=el.map.querySelectorAll('.seat'); var firstHit=null;
    Array.prototype.forEach.call(seats,function(s){
      s.classList.remove('hot');
      if(!q) return;
      var id=s.getAttribute('data-seat'); var a=state.assignBySeat[id];
      if(a){ var hay=((a.company||'')+' '+(a.guest_name||'')).toLowerCase();
        if(hay.indexOf(q.toLowerCase())>=0){ s.classList.add('hot'); if(!firstHit) firstHit=s; } }
    });
    if(firstHit) firstHit.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});
    // Debounced sponsor search -> panel list (works across ALL auditoriums).
    clearTimeout(searchT);
    if(q.length<2){ if(!state.moving) { el.side.className='side empty'; el.side.innerHTML="<div>Tap any seat to see who's there<br>and move them.</div>"; } return; }
    searchT=setTimeout(function(){ searchSponsors(q); }, 220);
  });

  async function searchSponsors(q){
    if(state.moving) return;
    var d;
    try{ var r=await fetch('/api/gala/admin/sponsor?q='+encodeURIComponent(q)); d=await r.json(); }
    catch(e){ return; }
    renderSponsorList((d&&d.results)||[], 'Search · ', '“'+esc(q)+'”', 'No sponsor found for “'+esc(q)+'”. Try a shorter term.');
  }

  // Shared renderer for any sponsor list (search results or All sponsors).
  function renderSponsorList(list, eyebrowPrefix, titleHtml, emptyMsg){
    el.side.className='side open';
    if(!list.length){
      el.side.innerHTML='<div class="side-h"><div class="eyebrow">'+eyebrowPrefix+'0</div>'
        +'<div class="seatbig" style="font-size:22px;">No matches</div></div>'
        +'<div class="side-b"><p class="instr">'+emptyMsg+'</p></div>'
        +'<div class="actions"><button class="btn cancel" id="closeSide">Close</button></div>';
      document.getElementById('closeSide').onclick=clearTransient; return;
    }
    var html='<div class="side-h"><div class="eyebrow">'+eyebrowPrefix+list.length+'</div>'
      +'<div class="seatbig" style="font-size:22px;">'+titleHtml+'</div></div>'
      +'<div class="side-b" id="sponsorList">';
    list.forEach(function(s){
      var done = s.purchased>0 && s.placed>=s.purchased;
      html+='<button class="dsponsor" data-id="'+s.id+'" data-name="'+esc((s.company||'').toLowerCase())+'">'
        +'<span class="dsponsor-name">'+esc(s.company)+'</span>'
        +'<span class="dseat-meta">'+s.placed+'/'+s.purchased+' placed'
        +(done?'':' · <span style="color:var(--gold)">needs '+(s.purchased-s.placed)+'</span>')
        +(s.tier?(' · '+esc(s.tier)):'')+'</span></button>';
    });
    html+='</div>';
    el.side.innerHTML=html;
    Array.prototype.forEach.call(el.side.querySelectorAll('.dsponsor'),function(btn){
      btn.onclick=function(){ renderDossier(Number(btn.getAttribute('data-id')), null); };
    });
  }

  // ── All sponsors button ──
  el.allBtn.onclick=async function(){
    if(state.moving) clearTransient();
    el.search.value='';
    el.side.className='side open';
    el.side.innerHTML='<div class="side-h"><div class="eyebrow">All sponsors</div><div class="seatbig" style="font-size:22px;">Loading…</div></div>';
    var d;
    try{ var r=await fetch('/api/gala/admin/sponsor?all=1'); d=await r.json(); }
    catch(e){ toast('Could not load sponsors','err'); return; }
    var list=(d&&d.results)||[];
    state.allSponsors=list;
    renderSponsorList(list, 'All sponsors · ', 'Browse', 'No sponsors found.');
    // Prepend a quick filter box to the list body
    var body=document.getElementById('sponsorList');
    if(body){
      var fwrap=document.createElement('div');
      fwrap.innerHTML='<input id="listFilter" placeholder="Filter by name…" '
        +'style="width:100%;background:rgba(0,0,0,.25);border:1px solid var(--rule);color:#fff;font-family:inherit;font-size:14px;padding:10px 12px;border-radius:9px;margin-bottom:12px;">';
      body.insertBefore(fwrap.firstChild, body.firstChild);
      var fin=document.getElementById('listFilter');
      fin.addEventListener('input',function(){
        var qq=fin.value.trim().toLowerCase();
        Array.prototype.forEach.call(body.querySelectorAll('.dsponsor'),function(b){
          b.style.display = (!qq || b.getAttribute('data-name').indexOf(qq)>=0) ? '' : 'none';
        });
      });
      fin.focus();
    }
  };

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
