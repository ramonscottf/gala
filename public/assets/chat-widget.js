/* DEF Gala 2026 — Help Bubble Widget
 * Drop-in: <script src="/assets/chat-widget.js" defer></script>
 *
 * Self-contained vanilla JS + CSS. No deps.
 * - Corner bubble bottom-right on every page
 * - Click → expands chat panel
 * - Top toggle: AI Helper ↔ Live Help
 * - Gates new sessions on name + email
 * - Polls /poll every 6s in 'live' mode for Slack replies
 *
 * Endpoints:
 *   POST /api/gala/chat/start       { name, email }
 *   POST /api/gala/chat/message     { content }
 *   POST /api/gala/chat/toggle      { mode: 'ai' | 'live' }
 *   GET  /api/gala/chat/poll?since
 */
(function () {
  if (window.__galaChatLoaded) return;
  window.__galaChatLoaded = true;

  // Allow opt-out per page: <body data-no-chat-widget>
  if (document.body && document.body.hasAttribute('data-no-chat-widget')) return;

  const NAVY = '#0a2540';
  const BLUE = '#1e88e5';
  const RED = '#e53935';
  const GREY = '#f5f7fa';
  const TEXT = '#1a1f2e';

  const css = `
    .gx-bubble-btn {
      position: fixed; right: 20px; bottom: 20px; z-index: 999998;
      width: 60px; height: 60px; border-radius: 30px; border: 0;
      background: ${NAVY}; color: white; cursor: pointer;
      box-shadow: 0 6px 20px rgba(10,37,64,0.35);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .gx-bubble-btn:hover { transform: translateY(-2px); transition: transform .12s; }
    .gx-bubble-btn svg { width: 26px; height: 26px; fill: white; }
    .gx-bubble-btn .gx-dot {
      position: absolute; top: 8px; right: 8px;
      width: 12px; height: 12px; border-radius: 6px; background: ${RED};
      display: none;
    }
    .gx-bubble-btn .gx-dot.gx-show { display: block; }

    .gx-panel {
      position: fixed; right: 20px; bottom: 90px; z-index: 999999;
      width: 380px; max-width: calc(100vw - 24px);
      height: 560px; max-height: calc(100vh - 110px);
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

    .gx-toggle {
      display: flex; padding: 10px 12px; gap: 6px; background: ${GREY};
      border-bottom: 1px solid #e5e9f0;
    }
    .gx-toggle button {
      flex: 1; padding: 8px 10px; border: 0; border-radius: 20px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      background: transparent; color: #6b7280;
    }
    .gx-toggle button.gx-active {
      background: white; color: ${NAVY}; box-shadow: 0 1px 3px rgba(10,37,64,0.12);
    }

    .gx-body {
      flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px;
      background: white;
    }
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
    .gx-input-row textarea {
      flex: 1; resize: none; border: 1px solid #d1d5db; border-radius: 18px;
      padding: 9px 12px; font-size: 14px; font-family: inherit; outline: none;
      max-height: 100px; min-height: 38px; line-height: 1.4;
    }
    .gx-input-row textarea:focus { border-color: ${BLUE}; }
    .gx-input-row button {
      border: 0; background: ${NAVY}; color: white; width: 38px; height: 38px;
      border-radius: 19px; cursor: pointer; align-self: flex-end;
      display: flex; align-items: center; justify-content: center;
    }
    .gx-input-row button:disabled { opacity: .4; cursor: default; }
    .gx-input-row button svg { width: 18px; height: 18px; fill: white; }

    .gx-gate { padding: 18px 16px; }
    .gx-gate p { margin: 0 0 12px; font-size: 14px; color: ${TEXT}; line-height: 1.5; }
    .gx-gate label { display: block; font-size: 12px; font-weight: 600; color: #4b5563; margin: 10px 0 4px; }
    .gx-gate input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; }
    .gx-gate input:focus { border-color: ${BLUE}; }
    .gx-gate button {
      margin-top: 14px; width: 100%; background: ${NAVY}; color: white;
      border: 0; padding: 11px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .gx-gate .gx-error { color: ${RED}; font-size: 12px; margin-top: 6px; min-height: 16px; }

    .gx-mode-banner { font-size: 12px; padding: 6px 14px; text-align: center; background: ${GREY}; color: #4b5563; border-bottom: 1px solid #e5e9f0; }
    .gx-mode-banner.gx-live { background: #fff4e5; color: #92400e; }

    @media (max-width: 480px) {
      .gx-panel { right: 8px; bottom: 80px; width: calc(100vw - 16px); height: calc(100vh - 100px); }
    }
  `;

  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // ---------- DOM scaffolding ----------
  const btn = document.createElement('button');
  btn.className = 'gx-bubble-btn';
  btn.setAttribute('aria-label', 'Open chat');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.05 2 11c0 2.78 1.42 5.27 3.65 6.91L5 22l4.5-1.96c.79.18 1.62.27 2.5.27 5.52 0 10-4.05 10-9S17.52 2 12 2z"/></svg>
    <span class="gx-dot" id="gx-dot"></span>
  `;
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
        <p>Hi! I'm here to help with questions about the gala. Tell me a bit about you and we'll get started.</p>
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

  let state = {
    open: false,
    threadId: null,
    mode: 'ai',
    lastSeen: '1970-01-01T00:00:00.000Z',
    pollTimer: null,
  };

  // ---------- helpers ----------
  function escapeText(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }
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
  }
  function hideTyping() {
    bodyEl.querySelectorAll('.gx-typing').forEach(t => t.remove());
  }
  function showBanner(text, isLive) {
    banner.textContent = text;
    banner.className = 'gx-mode-banner' + (isLive ? ' gx-live' : '');
    banner.style.display = 'block';
    setTimeout(() => { if (banner.textContent === text) banner.style.display = 'none'; }, 4000);
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
        // advance lastSeen so we don't re-fetch nothing
        state.lastSeen = data.server_now;
      }
    } catch (e) { /* swallow */ }
  }

  // ---------- handlers ----------
  btn.addEventListener('click', () => {
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
      toggleEl.style.display = 'flex';
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
    showTyping();
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
      }
      // refresh lastSeen so polling doesn't re-emit it
      state.lastSeen = new Date().toISOString();
    } catch (err) {
      hideTyping();
      appendMsg('system', "Couldn't reach the server. Please try again.");
    }
  }

  // Auto-resume on load if cookie exists
  fetch('/api/gala/chat/start', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then(r => r.json()).then(data => {
    if (data.thread_id) {
      state.threadId = data.thread_id;
      const gate = $('#gx-gate');
      if (gate) gate.remove();
      toggleEl.style.display = 'flex';
      inputRow.style.display = 'flex';
      setMode(data.mode || 'ai');
      pollOnce(); // surface any pending agent messages
    }
  }).catch(() => {});
})();
