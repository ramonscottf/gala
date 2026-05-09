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

  // Extract sponsor/delegation token from the page URL so Booker can
  // personalize answers when the user is on their booking portal.
  // Pattern: /sponsor/{token} or /sponsor/{token}/anything-else.
  // The token is opaque; the server validates it via resolveToken().
  // If the page isn't a sponsor portal page (e.g. /event/, /faq/),
  // returns empty and chat falls back to FAQ-only mode.
  function getSponsorToken() {
    const m = (window.location.pathname || '').match(/^\/sponsor\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }
  const SPONSOR_TOKEN = getSponsorToken();

  // Page-aware theming. The widget detects which gala page it's on and
  // picks a palette that matches. The teaser page (/event/) uses a midnight
  // navy + indigo with cyan/red accents; the sponsor portal (/sponsor/*)
  // uses the same family but lighter, more functional. Other pages keep
  // a neutral default.
  //
  // Theme determines: header background, mode banner, bubble dot color,
  // user message bubble background. The PNG mascot is always the same.
  const PAGE_THEMES = {
    teaser: {
      headerBg: 'linear-gradient(135deg, #11194a 0%, #1c2760 100%)',
      headerText: '#ffffff',
      headerSub: 'rgba(255,255,255,0.72)',
      panelBg: '#fbf8f3',           // paper
      bodyBg: 'linear-gradient(180deg, #ffffff 0%, #f6f4ee 100%)',
      userBg: '#11194a',
      userText: '#ffffff',
      aiBg: '#ffffff',
      aiText: '#1a1f2e',
      aiBorder: '#e8e2d5',
      sendBtn: '#11194a',
      sendBtnHover: '#1c2760',
      banner: '#fff5e1',
      bannerText: '#7a5a12',
      gateAccent: '#11194a',
    },
    sponsor: {
      headerBg: 'linear-gradient(135deg, #11194a 0%, #242f68 100%)',
      headerText: '#ffffff',
      headerSub: 'rgba(255,255,255,0.78)',
      panelBg: '#ffffff',
      bodyBg: '#f7f8fb',
      userBg: '#11194a',
      userText: '#ffffff',
      aiBg: '#ffffff',
      aiText: '#1a1f2e',
      aiBorder: '#e5e9f0',
      sendBtn: '#11194a',
      sendBtnHover: '#1c2760',
      banner: '#eef1ff',
      bannerText: '#1c2760',
      gateAccent: '#11194a',
    },
    neutral: {
      headerBg: '#0a2540',
      headerText: '#ffffff',
      headerSub: 'rgba(255,255,255,0.7)',
      panelBg: '#ffffff',
      bodyBg: '#f5f7fa',
      userBg: '#0a2540',
      userText: '#ffffff',
      aiBg: '#ffffff',
      aiText: '#1a1f2e',
      aiBorder: '#e5e9f0',
      sendBtn: '#0a2540',
      sendBtnHover: '#11194a',
      banner: '#eef2f7',
      bannerText: '#1a1f2e',
      gateAccent: '#0a2540',
    },
  };
  function pickTheme() {
    const path = window.location.pathname || '';
    if (/^\/event(\/|$)/.test(path)) return PAGE_THEMES.teaser;
    if (/^\/sponsor(\/|$)/.test(path)) return PAGE_THEMES.sponsor;
    return PAGE_THEMES.neutral;
  }
  const T = pickTheme();
  // Legacy aliases so existing CSS template strings still work.
  const NAVY = T.userBg;
  const BLUE = '#1e88e5';
  const RED = '#e53935';
  const GREY = T.bodyBg.includes('linear') ? '#f5f7fa' : T.bodyBg;
  const TEXT = T.aiText;

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
      background: ${T.panelBg}; border-radius: 16px; overflow: hidden;
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
    .gx-input-row textarea { flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 18px; padding: 9px 12px; font-size: 16px; font-family: inherit; outline: none; max-height: 100px; min-height: 38px; line-height: 1.4; }
    .gx-input-row textarea:focus { border-color: ${BLUE}; }
    .gx-input-row button { border: 0; background: ${NAVY}; color: white; width: 38px; height: 38px; border-radius: 19px; cursor: pointer; align-self: flex-end; display: flex; align-items: center; justify-content: center; }
    .gx-input-row button:disabled { opacity: .4; cursor: default; }
    .gx-input-row button svg { width: 18px; height: 18px; fill: white; }
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
        <h3>Ask Booker</h3>
        <div class="gx-sub">DEF Gala · June 10 · Legacy Crossing</div>
      </div>
      <button class="gx-close" aria-label="Close">&times;</button>
    </div>
    <div class="gx-mode-banner" id="gx-banner" style="display:none"></div>
    <div class="gx-body" id="gx-body">
    </div>
    <div class="gx-input-row" id="gx-input-row">
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
  // toggle was removed; AI-only mode
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
    // AI-only mode while Slack live-help is offline. Banner is hidden — the
    // chat panel header already says "DEF Gala 2026 Help · Booker" which is
    // signal enough.
    state.mode = 'ai';
    banner.style.display = 'none';
    stopPolling();
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
    if (!state.open) {
      setBookerExpression('big-smile');  // greet on open
      autoStart();                        // open or resume the chat session
    }
    state.open = !state.open;
    panel.style.display = state.open ? 'flex' : 'none';
    if (state.open) dot.classList.remove('gx-show');
  });
  $('.gx-close').addEventListener('click', () => {
    state.open = false; panel.style.display = 'none';
  });

  // Gate removed — chat starts automatically when panel opens (autoStart below)

  // No mode toggle anymore — AI Helper is the only mode

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);




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
        headers: SPONSOR_TOKEN ? { 'Content-Type': 'application/json', 'X-Gala-Sponsor-Token': SPONSOR_TOKEN } : { 'Content-Type': 'application/json' },
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

  // Auto-start: now that the server allows anonymous chat threads
  // (migration 008), we don't need to gate on name/email. Just start
  // a thread and remove the gate. The gate UI is kept in the DOM for
  // potential reuse (e.g. when we re-enable Slack live escalation,
  // we'll show a name/email prompt at THAT moment, not as an entry
  // barrier here).
  //
  // The X-Gala-Sponsor-Token header (when present) tells the server
  // who this person is — they're on their booking portal, so we have
  // their identity from there.
  // autoStart: silently create or resume an anonymous thread when the
  // chat panel first opens. No identity gate — Booker's FAQ chat is open
  // to everyone. Identity collection happens later if we re-enable Slack
  // live-help (which would need a name/email to address the human-side
  // handoff). For now this is fire-and-forget on chat open.
  let autoStarted = false;
  async function autoStart() {
    if (autoStarted) return;
    autoStarted = true;
    try {
      const r = await fetch('/api/gala/chat/start', {
        method: 'POST', credentials: 'include',
        headers: SPONSOR_TOKEN ? { 'Content-Type': 'application/json', 'X-Gala-Sponsor-Token': SPONSOR_TOKEN } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok || !data.thread_id) {
        appendMsg('system', "Couldn't start chat. Try refreshing the page.");
        autoStarted = false;
        return;
      }
      state.threadId = data.thread_id;
      setMode(data.mode || 'ai');
      // Greet only on the first start of a session. Resumed threads
      // already have message history rendered (or about to be polled).
      if (!data.resumed) {
        appendMsg('ai', "Hey! I'm Booker. Ask me anything about the gala — what to wear, what's in the auction, when to show up, the movies, seating, parking. What's on your mind?");
      } else {
        // Could pollOnce() here to fetch any messages we missed, but the
        // existing poll logic will catch it on the next tick.
        if (typeof pollOnce === 'function') pollOnce();
      }
      input.focus();
    } catch (err) {
      appendMsg('system', "Network error — please try again.");
      autoStarted = false;
    }
  }
})();
