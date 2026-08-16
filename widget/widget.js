/**
 * vlivechat Widget Embed Script
 * ==============================
 * Cara pakai di website:
 * <script>
 *   window.VLiveChat = { workspace: 'YOUR_WORKSPACE_CODE' };
 * </script>
 * <script src="https://your-server.com/widget/widget.js" async></script>
 */
(function () {
  "use strict";

  const cfg = window.VLiveChat || {};
  const WORKSPACE  = cfg.workspace || "";
  const API_BASE   = cfg.apiBase   || "http://localhost:3001";
  const WIDGET_URL = cfg.widgetUrl || (API_BASE + "/widget/livechat-widget.html");

  if (!WORKSPACE) {
    console.warn("[vlivechat] No workspace code set. Add window.VLiveChat = { workspace: 'your_code' }");
    return;
  }

  // ── Generate visitor ID ──────────────────────────────────────
  function getVisitorId() {
    const key = "vlc_vid_" + WORKSPACE;
    let vid = localStorage.getItem(key);
    if (!vid) {
      vid = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, vid);
    }
    return vid;
  }

  // ── Build widget iframe URL ──────────────────────────────────
  const visitorId = getVisitorId();
  const params = new URLSearchParams({
    embed:   "1",
    w:       WORKSPACE,
    page:    encodeURIComponent(location.href),
    ref:     encodeURIComponent(document.referrer || ""),
    vid:     visitorId,
    apiBase: API_BASE,
  });
  const iframeSrc = `${WIDGET_URL}?${params.toString()}`;

  // ── Inject styles ────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #vlc-embed-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      left: auto;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      pointer-events: none;        /* container passthrough; children re-enable */
    }
    #vlc-embed-container.vlc-left {
      right: auto;
      left: 24px;
      align-items: flex-start;
    }

    /* ── iframe: always in DOM flow, animated with opacity/transform ── */
    #vlc-iframe {
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 120px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1);
      margin-bottom: 16px;
      /* Closed state */
      opacity: 0;
      pointer-events: none;
      transform: scale(0.92) translateY(16px);
      transition: opacity 0.25s ease, transform 0.28s cubic-bezier(0.34, 1.46, 0.64, 1);
      /* Keep collapsed so it doesn't occupy space when hidden */
      visibility: hidden;
      max-height: 0;
      margin-bottom: 0;
      overflow: hidden;
    }
    #vlc-iframe.vlc-open {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1) translateY(0);
      visibility: visible;
      max-height: calc(100vh - 120px);
      margin-bottom: 16px;
    }

    #vlc-toggle-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      outline: none;
      background: #1e3a5f;
      flex-shrink: 0;
      pointer-events: auto;       /* re-enable pointer on button */
    }
    #vlc-toggle-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    }
    #vlc-toggle-btn svg { transition: transform 0.3s ease; }

    #vlc-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #ef4444;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      font-size: 11px;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    @media (max-width: 480px) {
      #vlc-iframe { width: calc(100vw - 16px); }
      #vlc-iframe.vlc-open { max-height: calc(100vh - 100px); }
    }
  `;
  document.head.appendChild(style);

  // ── Build DOM ─────────────────────────────────────────────────
  const container = document.createElement("div");
  container.id = "vlc-embed-container";

  const iframe = document.createElement("iframe");
  iframe.id    = "vlc-iframe";
  iframe.src   = iframeSrc;
  iframe.allow = "microphone; camera";
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", "Live Chat");

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "vlc-toggle-btn";
  toggleBtn.setAttribute("aria-label", "Chat dengan kami");
  toggleBtn.innerHTML = `
    <span id="vlc-badge"></span>
    <svg id="vlc-icon-chat" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>
    <svg id="vlc-icon-close" xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="white" viewBox="0 0 24 24" style="display:none">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;

  container.appendChild(iframe);
  container.appendChild(toggleBtn);
  document.body.appendChild(container);

  // ── Helper: apply position class ─────────────────────────────
  function applyPosition(pos) {
    if (pos === "left") {
      container.classList.add("vlc-left");
    } else {
      container.classList.remove("vlc-left");
    }
  }

  // ── Apply branding + position IMMEDIATELY from HTTP (no flash) ─
  fetch(`${API_BASE}/public/settings/${WORKSPACE}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      if (data.brand_color) {
        toggleBtn.style.background = data.brand_color;
      }
      // Apply position right away so it never flickers from right → left
      if (data.widget_position) {
        applyPosition(data.widget_position);
      }
    })
    .catch(() => {});

  // ── Toggle open/close ────────────────────────────────────────
  let isOpen = false;

  function setOpen(open) {
    isOpen = open;
    iframe.classList.toggle("vlc-open", isOpen);
    document.getElementById("vlc-icon-chat").style.display  = isOpen ? "none"  : "block";
    document.getElementById("vlc-icon-close").style.display = isOpen ? "block" : "none";
    if (isOpen) clearBadge();
  }

  toggleBtn.addEventListener("click", () => setOpen(!isOpen));

  // ── Badge (unread count) ─────────────────────────────────────
  let unreadCount = 0;
  function showBadge(n) {
    const badge = document.getElementById("vlc-badge");
    badge.style.display = "flex";
    badge.textContent = n > 9 ? "9+" : n;
  }
  function clearBadge() {
    unreadCount = 0;
    const badge = document.getElementById("vlc-badge");
    badge.style.display = "none";
  }

  // ── Messages from iframe ──────────────────────────────────────
  window.addEventListener("message", (e) => {
    if (!e.data || e.data.source !== "vlc-widget") return;

    switch (e.data.type) {
      case "vlc:new_message":
        if (!isOpen) {
          unreadCount++;
          showBadge(unreadCount);
        }
        break;

      case "vlc:close":
        setOpen(false);
        break;

      case "vlc:open":
        setOpen(true);
        break;

      case "vlc:branding":
        // Apply brand color
        if (e.data.color) {
          toggleBtn.style.background = e.data.color;
        }
        // Apply position — BIDIRECTIONAL (add OR remove vlc-left)
        if (e.data.position !== undefined) {
          applyPosition(e.data.position);
        }
        break;
    }
  });

  // ── Auto-open if configured ───────────────────────────────────
  if (cfg.autoOpen) {
    setTimeout(() => {
      if (!isOpen) setOpen(true);
    }, cfg.autoOpenDelay || 3000);
  }

  // ── Public API ────────────────────────────────────────────────
  window.VLiveChatAPI = {
    open:        () => setOpen(true),
    close:       () => setOpen(false),
    toggle:      () => setOpen(!isOpen),
    setUnread:   showBadge,
    clearUnread: clearBadge,
  };
})();
