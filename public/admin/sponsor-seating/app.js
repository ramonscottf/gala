(function(){
  'use strict';
  var DINNER = { frenchdip:'Hot French Dip', salad:'Chicken Salad', veggie:'Vegetarian', kids:'Kids Meal' };

  var state = {
    sponsorId:null, sponsor:null, groups:[],
    showByKey:{},                 // "t:s" -> {movie_title, show_start, dinner_time}
    theatersById:{},              // id -> layout theater
    dest:null,                    // {t,s} shown in workspace
    mapAssign:{}, mapHolds:{},    // current dest occupancy
    move:null,                    // {seats:[{t,s,r,n,seat}], label}
    proposed:null,                // [{t,s,r,n,seat}]
  };

  var el = {
    search:document.getElementById('search'),
    results:document.getElementById('results'),
    meta:document.getElementById('sponsorMeta'),
    roster:document.getElementById('roster'),
    destSel:document.getElementById('destSel'),
    wtitle:document.getElementById('wtitle'),
    movebar:document.getElementById('movebar'),
    moveLbl:document.getElementById('moveLbl'),
    confirmMove:document.getElementById('confirmMove'),
    cancelMove:document.getElementById('cancelMove'),
    map:document.getElementById('map'),
    toast:document.getElementById('toast'),
  };

  function toast(msg,kind){
    el.toast.textContent=msg; el.toast.className='toast show'+(kind?(' '+kind):'');
    clearTimeout(toast._t); toast._t=setTimeout(function(){ el.toast.className='toast'; },3000);
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function showLabel(s){ return s===2?'Late':'Early'; }

  async function api(path, opts){
    var r = await fetch(path, opts);
    if(r.status===401){ toast('Session expired — open the seating chart and log in, then come back','err'); throw new Error('401'); }
    return r;
  }

  // ── load reference data ──
  async function loadShowtimes(){
    var r = await api('/api/gala/movies'); var j = await r.json();
    var st = j.showtimes||[];
    var seen = {}; var opts=[];
    st.sort(function(a,b){ return a.theater_id-b.theater_id || a.showing_number-b.showing_number; });
    st.forEach(function(s){
      var key=s.theater_id+':'+s.showing_number;
      if(seen[key]) return; seen[key]=true;
      state.showByKey[key]={ movie_title:s.movie_title, show_start:s.show_start, dinner_time:s.dinner_time };
      opts.push('<option value="'+key+'">Aud '+s.theater_id+' · '+showLabel(s.showing_number)
        +' · '+esc(s.movie_title||'Movie')+(s.show_start?(' · '+esc(s.show_start)):'')+'</option>');
    });
    el.destSel.innerHTML = opts.join('');
  }
  async function loadLayouts(){
    var r = await fetch('/data/theater-layouts.json'); var j = await r.json();
    (j.theaters||[]).forEach(function(t){ state.theatersById[t.id]=t; });
  }

  // ── sponsor roster ──
  async function loadSponsor(id){
    state.sponsorId=Number(id);
    var r = await api('/api/gala/admin/sponsor?id='+id); var d = await r.json();
    if(!d.sponsor){ toast('Sponsor not found','err'); return; }
    state.sponsor=d.sponsor; state.groups=d.groups||[];
    renderMeta(d); renderRoster();
    // default workspace to their first group's theater/showing
    if(state.groups.length){
      var g=state.groups[0]; setDest(g.theater_id, g.showing_number);
    }
    // reflect in URL for shareable/back
    try{ history.replaceState(null,'','?sponsor='+id); }catch(e){}
  }

  function renderMeta(d){
    var s=d.sponsor;
    el.meta.innerHTML='<b>'+esc(s.company)+'</b>'+(s.tier?(' · '+esc(s.tier)):'')
      +' · <b>'+d.placed+'</b>/'+s.purchased+' placed';
  }

  function renderRoster(){
    if(!state.groups.length){
      el.roster.innerHTML='<div class="empty"><b>'+esc(state.sponsor.company)+'</b> has no seats placed yet.</div>';
      return;
    }
    var html='';
    state.groups.forEach(function(g){
      var key=g.theater_id+':'+g.showing_number;
      var sub=state.showByKey[key]||{};
      html+='<div class="grp"><div class="grp-h">'
        +'<div class="movie">'+esc(g.movie_title||sub.movie_title||'Movie')+'</div>'
        +'<div class="sub">Aud '+g.theater_id+' · '+showLabel(g.showing_number)
          +(g.show_start||sub.show_start?(' · '+esc(g.show_start||sub.show_start)):'')+'</div></div>'
        +'<div class="grp-b">';
      // sub-group seats by owner (a delegate party, or the sponsor's own block)
      var byOwner={};
      g.seats.forEach(function(st){
        var ok=(st.delegation_id||'own')+'|'+(st.owner||'Sponsor');
        (byOwner[ok]=byOwner[ok]||{owner:st.owner||'Sponsor',seats:[]}).seats.push(st);
      });
      Object.keys(byOwner).forEach(function(ok,i){
        var party=byOwner[ok]; var seatIds=party.seats.map(function(x){return x.seat;});
        html+='<div style="margin-bottom:8px">';
        html+='<div style="font-size:12px;color:var(--muted);margin-bottom:3px">'+esc(party.owner)+'</div>';
        party.seats.forEach(function(st){
          html+='<div class="seatline"><span class="chip">'+esc(st.seat)+'</span>'
            +'<span class="who">'+esc(st.dinner_label||'no dinner')+'</span></div>';
        });
        html+='<div class="grp-actions"><button class="btn gold" data-move="'+key+'|'+i+'">Move these '+party.seats.length+' →</button></div>';
        html+='</div>';
        party._key=key+'|'+i; // stash for lookup
      });
      html+='</div></div>';
      g._byOwner=byOwner;
    });
    el.roster.innerHTML=html;
    Array.prototype.forEach.call(el.roster.querySelectorAll('[data-move]'),function(b){
      b.onclick=function(){ startMoveByKey(b.getAttribute('data-move')); };
    });
  }

  function startMoveByKey(mk){
    // mk = "t:s|ownerIndex"
    var parts=mk.split('|'); var tskey=parts[0]; var oi=Number(parts[1]);
    var ts=tskey.split(':'); var t=Number(ts[0]), s=Number(ts[1]);
    var g=state.groups.find(function(x){return x.theater_id===t && x.showing_number===s;});
    if(!g||!g._byOwner) return;
    var owners=Object.keys(g._byOwner); var party=g._byOwner[owners[oi]];
    if(!party) return;
    var seats=party.seats.map(function(st){ return {t:t,s:s,r:st.row,n:String(st.num),seat:st.seat}; });
    state.move={ seats:seats, label:party.owner };
    state.proposed=null;
    // show them where these people currently sit
    setDest(t,s);
    el.movebar.classList.add('show');
    el.confirmMove.disabled=true;
    el.moveLbl.innerHTML='Moving <b>'+seats.length+'</b> ('+esc(party.owner)+') — pick a theater above, then tap the left-most destination seat.';
    toast('Move mode: choose any theater & tap a destination');
  }

  function cancelMove(){
    state.move=null; state.proposed=null;
    el.movebar.classList.remove('show'); el.confirmMove.disabled=true;
    renderMap();
  }

  // ── workspace / seat map ──
  function setDest(t,s){
    state.dest={t:t,s:s};
    var key=t+':'+s;
    if(el.destSel.value!==key) el.destSel.value=key;
    var sub=state.showByKey[key]||{};
    el.wtitle.innerHTML='Aud '+t+' · '+showLabel(s)+(sub.movie_title?(' · <b>'+esc(sub.movie_title)+'</b>'):'');
    loadMap(t,s);
  }

  async function loadMap(t,s){
    state.mapAssign={}; state.mapHolds={};
    el.map.innerHTML='<div class="empty">Loading…</div>';
    try{
      var r=await api('/api/gala/admin/seatmap?theater_id='+t+'&showing_number='+s);
      var j=await r.json();
      (j.assignments||[]).forEach(function(a){ state.mapAssign[a.seat]=a; });
      (j.holds||[]).forEach(function(id){ state.mapHolds[id]=true; });
    }catch(e){ el.map.innerHTML='<div class="empty">Could not load seats.</div>'; return; }
    renderMap();
  }

  function ownSet(){
    var o={}; if(state.move){ state.move.seats.forEach(function(x){ o[x.t+'|'+x.s+'|'+x.r+'|'+x.n]=true; }); } return o;
  }

  function renderMap(){
    var t=state.theatersById[state.dest.t]; if(!t){ el.map.innerHTML='<div class="empty">No layout.</div>'; return; }
    var moving=!!state.move; var own=ownSet();
    var propSet={}; if(state.proposed){ state.proposed.forEach(function(p){ propSet[p.seat]=true; }); }
    var html='<div class="screen"></div>';
    (t.rows||[]).forEach(function(row){
      html+='<div class="seatrow"><span class="rowlab">'+esc(row.label)+'</span>';
      var colToNum={}; (row.cols||[]).forEach(function(c,i){ colToNum[c]=row.numbers[i]; });
      for(var c=t.minCol;c<=t.maxCol;c++){
        if(!(c in colToNum)){ html+='<div class="seat gap"></div>'; continue; }
        var num=colToNum[c]; var id=row.label+num;
        var a=state.mapAssign[id]; var held=state.mapHolds[id];
        var ownHere = own[state.dest.t+'|'+state.dest.s+'|'+row.label+'|'+num];
        var cls='seat';
        if(propSet[id]) cls+=' proposed';
        else if(a && Number(a.sponsor_id)===state.sponsorId) cls+=' mine';
        else if(a) cls+=' other';
        if(held && !ownHere) cls+=' held';
        // targetable: in move mode, open seats OR this sponsor's own vacating seats
        if(moving && !propSet[id] && ((!a) || ownHere) && !held){ cls+=' target'; }
        else if(moving && !propSet[id]){ cls+=' dim'; }
        html+='<div class="'+cls+'" data-row="'+esc(row.label)+'" data-num="'+num+'">'+num+'</div>';
      }
      html+='</div>';
    });
    el.map.innerHTML=html;
  }

  // find contiguous N-seat block in a row of the dest theater (open or own)
  function blockFrom(row, anchorNum, N, own){
    var t=state.theatersById[state.dest.t];
    var r=(t.rows||[]).find(function(x){return x.label===row;});
    if(!r) return null;
    var nums=(r.numbers||[]).map(String);
    function freeAt(start){
      if(start<0||start+N>nums.length) return null;
      var out=[];
      for(var i=0;i<N;i++){
        var num=nums[start+i]; var id=row+num;
        var a=state.mapAssign[id];
        var ownHere=own[state.dest.t+'|'+state.dest.s+'|'+row+'|'+num];
        if((a && !ownHere) || (state.mapHolds[id] && !ownHere)) return null;
        out.push({t:state.dest.t,s:state.dest.s,r:row,n:num,seat:id});
      }
      return out;
    }
    var ai=nums.indexOf(String(anchorNum)); if(ai<0) return null;
    var b=null;
    for(var x=ai;x>=0&&!b;x--){ b=freeAt(x); }
    if(!b){ for(var y=ai+1;y+N<=nums.length&&!b;y++){ b=freeAt(y); } }
    return b;
  }

  el.map.addEventListener('click',function(e){
    var cell=e.target.closest('.seat'); if(!cell||!state.move) return;
    if(!cell.classList.contains('target')) return;
    var row=cell.getAttribute('data-row'); var num=cell.getAttribute('data-num');
    var N=state.move.seats.length;
    var block=blockFrom(row,num,N,ownSet());
    if(!block){ toast('No open '+N+'-seat block in row '+row+' there','err'); return; }
    state.proposed=block; renderMap();
    var sub=state.showByKey[state.dest.t+':'+state.dest.s]||{};
    el.moveLbl.innerHTML='Move <b>'+N+'</b> ('+esc(state.move.label)+') → <b>'+block[0].seat+'–'+block[N-1].seat
      +'</b> · Aud '+state.dest.t+' '+showLabel(state.dest.s)+(sub.movie_title?(' · '+esc(sub.movie_title)):'');
    el.confirmMove.disabled=false;
  });

  el.confirmMove.onclick=async function(){
    if(!state.move||!state.proposed) return;
    var N=state.move.seats.length;
    var moves=[];
    for(var k=0;k<N;k++){
      moves.push({ from:{theater_id:state.move.seats[k].t,showing_number:state.move.seats[k].s,row_label:state.move.seats[k].r,seat_num:state.move.seats[k].n},
                   to:{theater_id:state.proposed[k].t,showing_number:state.proposed[k].s,row_label:state.proposed[k].r,seat_num:state.proposed[k].n} });
    }
    el.confirmMove.disabled=true; toast('Moving '+N+' seats…');
    try{
      var r=await api('/api/gala/admin/move-seats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moves:moves})});
      var j=await r.json();
      if(!r.ok){ toast(j.error||('Move failed ('+r.status+')'),'err'); el.confirmMove.disabled=false; return; }
      toast('Moved '+N+' to '+state.proposed[0].seat+'–'+state.proposed[N-1].seat,'ok');
      var keepDest=state.dest;
      state.move=null; state.proposed=null; el.movebar.classList.remove('show');
      await loadSponsor(state.sponsorId);
      setDest(keepDest.t, keepDest.s);
    }catch(e){ if(String(e.message)!=='401'){ toast('Network error — try again','err'); } el.confirmMove.disabled=false; }
  };

  el.cancelMove.onclick=cancelMove;
  el.destSel.onchange=function(){
    var v=el.destSel.value.split(':'); setDest(Number(v[0]),Number(v[1]));
    if(state.move){ state.proposed=null; el.confirmMove.disabled=true; }
  };

  // ── sponsor search ──
  var searchT=null;
  el.search.addEventListener('input',function(){
    var q=el.search.value.trim();
    clearTimeout(searchT);
    if(!q){ el.results.className=''; el.results.innerHTML=''; return; }
    searchT=setTimeout(async function(){
      try{
        var r=await api('/api/gala/admin/sponsor?q='+encodeURIComponent(q)); var j=await r.json();
        var rows=j.results||[];
        if(!rows.length){ el.results.innerHTML='<button disabled>No matches</button>'; el.results.className='show'; return; }
        el.results.innerHTML=rows.map(function(s){
          return '<button data-id="'+s.id+'"><span>'+esc(s.company)+'</span>'
            +'<span class="sub">'+(s.tier?esc(s.tier)+' · ':'')+s.placed+'/'+s.purchased+'</span></button>';
        }).join('');
        el.results.className='show';
        Array.prototype.forEach.call(el.results.querySelectorAll('[data-id]'),function(b){
          b.onclick=function(){ el.results.className=''; el.search.value=b.querySelector('span').textContent; loadSponsor(b.getAttribute('data-id')); };
        });
      }catch(e){}
    },220);
  });
  document.addEventListener('click',function(e){ if(!el.search.contains(e.target) && !el.results.contains(e.target)) el.results.className=''; });

  // ── boot ──
  (async function(){
    try{ await Promise.all([loadShowtimes(), loadLayouts()]); }
    catch(e){ return; }
    var pid=new URLSearchParams(location.search).get('sponsor');
    if(pid) loadSponsor(pid);
  })();
})();
