/* DEF Gala 2026 — Help Bubble Widget (Booker mascot edition)
 * Drop-in: <script src="/assets/chat-widget.js" defer></script>
 *
 * Self-contained vanilla JS + CSS. No deps.
 * - Booker mascot bottom-right on every page (replaces the navy circle)
 * - Click → expands chat panel
 * - Top toggle: AI Helper ↔ Live Help
 * - Gates new sessions on name + email
 * - Polls /poll every 6s in 'live' mode for Slack replies
 *
 * Booker animation states:
 *   bob   — default idle bob
 *   wave  — first-visit greeting (localStorage-flagged, decays to bob)
 *   think — slow tilt + speech-bubble dots while AI is processing
 *   jump  — squash-stretch x3 when an agent message arrives (notification)
 */
(function () {
  if (window.__galaChatLoaded) return;
  window.__galaChatLoaded = true;
  if (document.body && document.body.hasAttribute('data-no-chat-widget')) return;

  const NAVY = '#0a2540';
  const BLUE = '#1e88e5';
  const RED = '#e53935';
  const GREY = '#f5f7fa';
  const TEXT = '#1a1f2e';

  const css = `
    .gx-bubble-btn {
      position: fixed; right: 16px; bottom: 16px; z-index: 999998;
      width: 90px; height: 90px;
      background: transparent; border: 0; padding: 0; cursor: pointer;
      filter: drop-shadow(0 6px 14px rgba(13,27,61,0.28));
      -webkit-tap-highlight-color: transparent;
    }
    .gx-bubble-btn:hover { filter: drop-shadow(0 8px 18px rgba(13,27,61,0.35)); }
    .gx-bubble-btn:focus-visible { outline: 3px solid ${BLUE}; outline-offset: 4px; border-radius: 8px; }
    /* Booker is a stack of 9 expression PNGs (neutral, big-smile, excited,
       surprised, curious, confused, sad, determined, laughing). Only one
       layer has .gx-active at a time — others are opacity:0. Crossfade
       gives Booker real personality without the file size of video.
       The wrapper handles motion (bob/wave/jump); the layers handle face. */
    .gx-booker {
      width: 100%; height: 100%; position: relative;
      transform-origin: center bottom; pointer-events: none;
    }
    .gx-expr {
      position: absolute; inset: 0;
      background-size: contain; background-repeat: no-repeat; background-position: center;
      opacity: 0; transition: opacity 350ms ease-in-out;
    }
    .gx-expr.gx-active { opacity: 1; }
    .gx-expr.gx-neutral    { background-image: url('https://assets.daviskids.org/mascot/expressions/neutral.png'); }
    .gx-expr.gx-big-smile  { background-image: url('https://assets.daviskids.org/mascot/expressions/big-smile.png'); }
    .gx-expr.gx-excited    { background-image: url('https://assets.daviskids.org/mascot/expressions/excited.png'); }
    .gx-expr.gx-surprised  { background-image: url('https://assets.daviskids.org/mascot/expressions/surprised.png'); }
    .gx-expr.gx-curious    { background-image: url('https://assets.daviskids.org/mascot/expressions/curious.png'); }
    .gx-expr.gx-confused   { background-image: url('https://assets.daviskids.org/mascot/expressions/confused.png'); }
    .gx-expr.gx-sad        { background-image: url('https://assets.daviskids.org/mascot/expressions/sad.png'); }
    .gx-expr.gx-determined { background-image: url('https://assets.daviskids.org/mascot/expressions/determined.png'); }
    .gx-expr.gx-laughing   { background-image: url('https://assets.daviskids.org/mascot/expressions/laughing.png'); }

    /* Motion is on the wrapper, so all expressions move together. */
    .gx-booker.gx-bob { animation: gxBob 3.5s ease-in-out infinite; }
    @keyframes gxBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .gx-booker.gx-wave { animation: gxWave 2.4s ease-in-out 1 forwards; }
    @keyframes gxWave {
      0%, 100% { transform: rotate(0) translateY(0); }
      10% { transform: rotate(-10deg) translateY(-3px); }
      25% { transform: rotate(8deg) translateY(-3px); }
      40% { transform: rotate(-6deg) translateY(-2px); }
      55% { transform: rotate(6deg) translateY(-2px); }
      70% { transform: rotate(0) translateY(0); }
    }
    .gx-booker.gx-jump { animation: gxJump 0.8s ease-in-out 3; }
    @keyframes gxJump {
      0%, 100% { transform: translateY(0) scaleY(1); }
      20% { transform: translateY(0) scaleY(0.9); }
      45% { transform: translateY(-22px) scaleY(1.06); }
      70% { transform: translateY(0) scaleY(0.96); }
    }
    .gx-bubble-btn .gx-dot {
      position: absolute; top: 6px; right: 6px;
      width: 14px; height: 14px; border-radius: 7px;
      background: ${RED}; border: 2px solid white; display: none;
    }
    .gx-bubble-btn .gx-dot.gx-show { display: block; animation: gxDotPop .35s ease-out; }
    @keyframes gxDotPop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
    .gx-bubble-btn .gx-think-dots {
      position: absolute; top: 8px; left: -4px;
      display: none; gap: 3px;
      background: white; padding: 4px 7px; border-radius: 10px;
      box-shadow: 0 2px 6px rgba(13,27,61,0.18);
    }
    .gx-bubble-btn .gx-think-dots.gx-show { display: flex; }
    .gx-bubble-btn .gx-think-dots span {
      width: 5px; height: 5px; border-radius: 3px; background: #fbbf24;
      animation: gxDotPulse 1.4s ease-in-out infinite;
    }
    .gx-bubble-btn .gx-think-dots span:nth-child(2) { animation-delay: 0.2s; }
    .gx-bubble-btn .gx-think-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes gxDotPulse { 0%, 100% { opacity: 0.3; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1); } }
    @media (max-width: 480px) {
      .gx-bubble-btn { width: 78px; height: 78px; right: 12px; bottom: 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .gx-booker, .gx-booker.gx-bob, .gx-booker.gx-wave,
      .gx-booker.gx-jump { animation: none !important; }
      .gx-expr { transition: opacity 0s !important; }
    }

    .gx-panel {
      position: fixed; right: 16px; bottom: 118px; z-index: 999999;
      width: 380px; max-width: calc(100vw - 24px);
      height: 540px; max-height: calc(100vh - 140px);
      background: white; border-radius: 16px; overflow: hidden;
      box-shadow: 0 16px 48px rgba(10,37,64,0.28);
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: ${TEXT};
      animation: gxIn .18s ease-out;
    }
    @keyframes gxIn { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .gx-header {
      background: ${NAVY}; color: white; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .gx-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .gx-header .gx-sub { font-size: 12px; opacity: .85; margin-top: 2px; }
    .gx-close { background: transparent; border: 0; color: white; cursor: pointer; font-size: 22px; line-height: 1; padding: 4px 8px; }
    .gx-toggle { display: flex; padding: 10px 12px; gap: 6px; background: ${GREY}; border-bottom: 1px solid #e5e9f0; }
    .gx-toggle button { flex: 1; padding: 8px 10px; border: 0; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: #6b7280; }
    .gx-toggle button.gx-active { background: white; color: ${NAVY}; box-shadow: 0 1px 3px rgba(10,37,64,0.12); }
    .gx-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: white; }
    .gx-msg { max-width: 85%; padding: 10px 12px; border-radius: 14px; font-size: 14px; line-height: 1.45; word-wrap: break-word; }
    .gx-msg.gx-user { align-self: flex-end; background: ${BLUE}; color: white; border-bottom-right-radius: 4px; }
    .gx-msg.gx-ai, .gx-msg.gx-agent { align-self: flex-start; background: ${GREY}; color: ${TEXT}; border-bottom-left-radius: 4px; }
    .gx-msg.gx-agent { background: #fff4e5; border: 1px solid #ffd699; }
    .gx-msg.gx-system { align-self: center; background: transparent; color: #6b7280; font-size: 12px; font-style: italic; padding: 4px 8px; }
    .gx-msg .gx-by { font-size: 11px; opacity: .65; margin-bottom: 2px; font-weight: 600; }
    .gx-typing { align-self: flex-start; padding: 10px 12px; }
    .gx-typing span { display: inline-block; width: 6px; height: 6px; border-radius: 3px; background: #9ca3af; margin: 0 1px; animation: gxBounce 1.2s infinite; }
    .gx-typing span:nth-child(2) { animation-delay: .15s; }
    .gx-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes gxBounce { 0%,80%,100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
    .gx-input-row { padding: 10px 12px; border-top: 1px solid #e5e9f0; display: flex; gap: 8px; background: white; }
    .gx-input-row textarea { flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 18px; padding: 9px 12px; font-size: 14px; font-family: inherit; outline: none; max-height: 100px; min-height: 38px; line-height: 1.4; }
    .gx-input-row textarea:focus { border-color: ${BLUE}; }
    .gx-input-row button { border: 0; background: ${NAVY}; color: white; width: 38px; height: 38px; border-radius: 19px; cursor: pointer; align-self: flex-end; display: flex; align-items: center; justify-content: center; }
    .gx-input-row button:disabled { opacity: .4; cursor: default; }
    .gx-input-row button svg { width: 18px; height: 18px; fill: white; }
    .gx-gate { padding: 18px 16px; }
    .gx-gate p { margin: 0 0 12px; font-size: 14px; color: ${TEXT}; line-height: 1.5; }
    .gx-gate label { display: block; font-size: 12px; font-weight: 600; color: #4b5563; margin: 10px 0 4px; }
    .gx-gate input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; }
    .gx-gate input:focus { border-color: ${BLUE}; }
    .gx-gate button { margin-top: 14px; width: 100%; background: ${NAVY}; color: white; border: 0; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .gx-gate .gx-error { color: ${RED}; font-size: 12px; margin-top: 6px; min-height: 16px; }
    .gx-mode-banner { font-size: 12px; padding: 6px 14px; text-align: center; background: ${GREY}; color: #4b5563; border-bottom: 1px solid #e5e9f0; }
    .gx-mode-banner.gx-live { background: #fff4e5; color: #92400e; }
    @media (max-width: 480px) {
      .gx-panel { right: 8px; bottom: 100px; width: calc(100vw - 16px); height: calc(100vh - 120px); }
    }
  `;

  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  const btn = document.createElement('button');
  btn.className = 'gx-bubble-btn';
  btn.setAttribute('aria-label', 'Chat with Booker');
  // 9-layer expression stack. Default active = neutral. Switching is
  // a CSS opacity crossfade driven by setBookerExpression() below.
  const EXPRESSIONS = [
    'neutral', 'big-smile', 'excited', 'surprised', 'curious',
    'confused', 'sad', 'determined', 'laughing'
  ];
  const exprLayers = EXPRESSIONS.map(function (name) {
    return '<div class="gx-expr gx-' + name + (name === 'neutral' ? ' gx-active' : '') + '"></div>';
  }).join('');
  btn.innerHTML =
    '<div class="gx-booker gx-bob" id="gx-booker">' + exprLayers + '</div>' +
    '<span class="gx-dot" id="gx-dot"></span>' +
    '<span class="gx-think-dots" id="gx-think-dots"><span></span><span></span><span></span></span>';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'gx-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="gx-header">
      <div>
        <h3>DEF Gala 2026 Help</h3>
        <div class="gx-sub">June 10 · Megaplex Centerville</div>
      </div>
      <button class="gx-close" aria-label="Close">&times;</button>
    </div>
    <div class="gx-toggle" id="gx-toggle" style="display:none">
      <button data-mode="ai" class="gx-active">🤖 AI Helper</button>
      <button data-mode="live">👤 Live Help</button>
    </div>
    <div class="gx-mode-banner" id="gx-banner" style="display:none"></div>
    <div class="gx-body" id="gx-body">
      <div class="gx-gate" id="gx-gate">
        <p>Hi! I'm Booker. Tell me a bit about you and I can help you with anything gala-related.</p>
        <label>Your name</label>
        <input id="gx-name" type="text" autocomplete="name" placeholder="Jane Smith" />
        <label>Email</label>
        <input id="gx-email" type="email" autocomplete="email" placeholder="jane@example.com" />
        <button id="gx-start">Start chat</button>
        <div class="gx-error" id="gx-gate-err"></div>
      </div>
    </div>
    <div class="gx-input-row" id="gx-input-row" style="display:none">
      <textarea id="gx-input" rows="1" placeholder="Type your question…"></textarea>
      <button id="gx-send" disabled aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = (sel) => panel.querySelector(sel);
  const bodyEl = $('#gx-body');
  const inputRow = $('#gx-input-row');
  const input = $('#gx-input');
  const sendBtn = $('#gx-send');
  const toggleEl = $('#gx-toggle');
  const banner = $('#gx-banner');
  const dot = btn.querySelector('#gx-dot');
  const booker = btn.querySelector('#gx-booker');
  const thinkDots = btn.querySelector('#gx-think-dots');

  // Motion controller: bob (idle), wave (greeting), jump (celebration).
  // Note: 'think' was previously a wrapper-rotation hack; now it's an
  // expression swap (curious face + thinking dots) instead of body motion.
  function setBookerState(s) {
    booker.classList.remove('gx-bob', 'gx-wave', 'gx-jump');
    void booker.offsetWidth;
    if (s === 'think') {
      // Stay bobbing, but swap face and show dots
      booker.classList.add('gx-bob');
      setBookerExpression('curious');
      thinkDots.classList.add('gx-show');
    } else {
      booker.classList.add('gx-' + s);
      thinkDots.classList.remove('gx-show');
    }
  }
  function jumpThenBob() {
    // Celebrate with the laughing face mid-jump, then fade back to neutral
    setBookerExpression('laughing');
    setBookerState('jump');
    setTimeout(() => {
      setBookerState('bob');
      setBookerExpression('neutral');
    }, 2400);
  }
  // Crossfade to a different expression. The 9 layers are pre-rendered;
  // we just toggle which has .gx-active. Layer transitions are 350ms.
  function setBookerExpression(name) {
    if (!EXPRESSIONS.includes(name)) name = 'neutral';
    const layers = booker.querySelectorAll('.gx-expr');
    layers.forEach(function (el) {
      el.classList.toggle('gx-active', el.classList.contains('gx-' + name));
    });
  }
  // Public API for pages to drive Booker per their own state
  window.galaBookerSetExpression = setBookerExpression;
  window.galaBookerSetState = setBookerState;

  let state = {
    open: false, threadId: null, mode: 'ai',
    lastSeen: '1970-01-01T00:00:00.000Z', pollTimer: null,
  };

  try {
    if (!localStorage.getItem('gx_seen_booker')) {
      setTimeout(() => {
        setBookerState('wave');
        setTimeout(() => setBookerState('bob'), 2500);
      }, 600);
      localStorage.setItem('gx_seen_booker', '1');
    }
  } catch (e) { /* localStorage unavailable */ }

  function escapeText(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function linkify(html) {
    return html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">$1</a>');
  }
  function appendMsg(sender, content, prepend = false) {
    if (!content) return;
    const wrap = document.createElement('div');
    wrap.className = 'gx-msg gx-' + sender;
    const safe = linkify(escapeText(content)).replace(/\n/g, '<br>');
    if (sender === 'agent') {
      wrap.innerHTML = `<div class="gx-by">Scott (Davis Ed Foundation)</div>${safe}`;
    } else {
      wrap.innerHTML = safe;
    }
    if (prepend) bodyEl.prepend(wrap); else bodyEl.appendChild(wrap);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
  function showTyping() {
    if (bodyEl.querySelector('.gx-typing')) return;
    const t = document.createElement('div');
    t.className = 'gx-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    bodyEl.appendChild(t);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    setBookerState('think');
  }
  function hideTyping() {
    bodyEl.querySelectorAll('.gx-typing').forEach(t => t.remove());
    // Settle from think → bob with neutral face. The think dots hide too.
    setBookerState('bob');
    setBookerExpression('neutral');
  }

  function setMode(mode) {
    state.mode = mode;
    toggleEl.querySelectorAll('button').forEach(b => {
      b.classList.toggle('gx-active', b.dataset.mode === mode);
    });
    if (mode === 'live') {
      banner.textContent = 'Live Help — your messages go to Scott directly';
      banner.className = 'gx-mode-banner gx-live';
      banner.style.display = 'block';
      startPolling();
    } else {
      banner.textContent = 'AI Helper — answers are based on the gala FAQ';
      banner.className = 'gx-mode-banner';
      banner.style.display = 'block';
      stopPolling();
    }
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(pollOnce, 6000);
    pollOnce();
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }
  async function pollOnce() {
    if (!state.threadId) return;
    try {
      const r = await fetch('/api/gala/chat/poll?since=' + encodeURIComponent(state.lastSeen), { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      if (data.messages && data.messages.length) {
        for (const m of data.messages) {
          if (m.sender === 'agent' || m.sender === 'system') {
            appendMsg(m.sender, m.content);
            if (!state.open && m.sender === 'agent') {
              dot.classList.add('gx-show');
              jumpThenBob();
            }
          }
          state.lastSeen = m.created_at;
        }
      } else if (data.server_now) {
        state.lastSeen = data.server_now;
      }
    } catch (e) { /* swallow */ }
  }

  btn.addEventListener('click', () => {
    if (!state.open) setBookerExpression('big-smile');  // greet on open
    state.open = !state.open;
    panel.style.display = state.open ? 'flex' : 'none';
    if (state.open) dot.classList.remove('gx-show');
  });
  $('.gx-close').addEventListener('click', () => {
    state.open = false; panel.style.display = 'none';
  });

  $('#gx-start').addEventListener('click', startSession);
  $('#gx-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gx-email').focus(); });
  $('#gx-email').addEventListener('keydown', e => { if (e.key === 'Enter') startSession(); });

  toggleEl.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => switchMode(b.dataset.mode));
  });

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  async function startSession() {
    const name = $('#gx-name').value.trim();
    const email = $('#gx-email').value.trim();
    const errEl = $('#gx-gate-err');
    errEl.textContent = '';
    if (!name) return errEl.textContent = 'Please enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(email)) return errEl.textContent = 'Please enter a valid email.';
    $('#gx-start').disabled = true;
    try {
      const r = await fetch('/api/gala/chat/start', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await r.json();
      if (!r.ok) { errEl.textContent = data.error || 'Could not start chat.'; $('#gx-start').disabled = false; return; }
      state.threadId = data.thread_id;
      $('#gx-gate').remove();
      // Slack live-help disabled tonight (AI-only mode). Toggle stays hidden.
      // toggleEl.style.display = 'flex';
      inputRow.style.display = 'flex';
      setMode(data.mode || 'ai');
      appendMsg('ai', `Hi ${name.split(' ')[0]}! I can answer questions about tickets, showtimes, the four movies, seating, parking, dietary needs — anything gala. What would you like to know?`);
      input.focus();
    } catch (err) {
      errEl.textContent = 'Network error — please try again.';
      $('#gx-start').disabled = false;
    }
  }

  async function switchMode(mode) {
    if (mode === state.mode) return;
    try {
      const r = await fetch('/api/gala/chat/toggle', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (r.ok) setMode(mode);
    } catch (e) { /* ignore */ }
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    appendMsg('user', text);
    // Booker acknowledges the message with a quick smile, then back to thinking
    setBookerExpression('big-smile');
    setTimeout(() => showTyping(), 250);
    try {
      const r = await fetch('/api/gala/chat/message', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const data = await r.json();
      hideTyping();
      if (data.reply) {
        appendMsg(data.reply.sender, data.reply.content);
        // Booker delivered the answer — flash "determined" face briefly
        setBookerExpression('determined');
        setTimeout(() => setBookerExpression('neutral'), 1400);
      }
      state.lastSeen = new Date().toISOString();
    } catch (err) {
      hideTyping();
      appendMsg('system', "Couldn't reach the server. Please try again.");
    }
  }

  fetch('/api/gala/chat/start', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then(r => r.json()).then(data => {
    if (data.thread_id) {
      state.threadId = data.thread_id;
      const gate = $('#gx-gate');
      if (gate) gate.remove();
      // Slack live-help disabled tonight (AI-only mode). Toggle stays hidden.
      // toggleEl.style.display = 'flex';
      inputRow.style.display = 'flex';
      setMode(data.mode || 'ai');
      pollOnce();
    }
  }).catch(() => {});
})();
