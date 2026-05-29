// Cookiecutter — Page Overlay
// Injects a floating icon into pages that expands to show live tracker info.
// Uses Shadow DOM for complete style isolation.

(function () {
  "use strict";

  if (document.getElementById("cookiecutter-host")) return; // already injected

  // ── State ────────────────────────────────────────────────────────────────

  let trackers = [];
  let bannerStatus = { found: false, declined: false };
  let expanded = false;

  // ── Shadow DOM setup ─────────────────────────────────────────────────────

  const host = document.createElement("div");
  host.id = "cookiecutter-host";
  Object.assign(host.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647",
    fontFamily: "inherit",
    lineHeight: "normal",
  });

  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :host { all: initial; }

      .cc-pill {
        display: flex;
        align-items: center;
        gap: 5px;
        background: #18181b;
        border: 1px solid #3f3f46;
        border-radius: 20px;
        padding: 6px 10px 6px 8px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        transition: background 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .cc-pill:hover { background: #27272a; border-color: #52525b; }
      .cc-pill.dragging { cursor: grabbing !important; }

      .cc-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      .cc-badge {
        font-size: 11px;
        font-weight: 700;
        color: #f4f4f5;
        background: #e74c3c;
        border-radius: 10px;
        min-width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        line-height: 1;
      }
      .cc-badge.zero { background: #3f3f46; color: #a1a1aa; }

      /* ── Panel ── */
      .cc-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 260px;
        background: #18181b;
        border: 1px solid #3f3f46;
        border-radius: 10px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.6);
        overflow: hidden;
        display: none;
        flex-direction: column;
      }
      .cc-panel.open { display: flex; }

      .cc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 11px;
        border-bottom: 1px solid #3f3f46;
      }

      .cc-panel-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .cc-panel-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .cc-panel-title {
        font-size: 12px;
        font-weight: 700;
        color: #f4f4f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: -0.01em;
      }

      .cc-header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .cc-close, .cc-settings-btn {
        background: none;
        border: none;
        color: #71717a;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        transition: color 0.1s, background 0.1s;
        flex-shrink: 0;
      }
      .cc-close { font-size: 13px; }
      .cc-settings-btn { font-size: 14px; }
      .cc-close:hover, .cc-settings-btn:hover { color: #f4f4f5; background: #3f3f46; }
      .cc-settings-btn.active { color: #f59e0b; background: #3f3f46; }

      /* ── Settings popout (floating, lives at shadow root level) ── */
      .cc-settings-popout {
        position: fixed;
        width: 210px;
        background: #18181b;
        border: 1px solid #3f3f46;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.65);
        z-index: 2147483647;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .cc-settings-popout.visible {
        opacity: 1;
        pointer-events: all;
      }

      /* Right-pointing tail (mirrors the tooltip arrow) */
      .cc-settings-popout::before {
        content: "";
        position: absolute;
        left: 100%;
        top: 14px;
        border: 7px solid transparent;
        border-left-color: #3f3f46;
      }
      .cc-settings-popout::after {
        content: "";
        position: absolute;
        left: 100%;
        top: 14px;
        margin-left: -1px;
        border: 6px solid transparent;
        border-left-color: #18181b;
      }

      .cc-sp-header {
        padding: 8px 11px 7px;
        border-bottom: 1px solid #3f3f46;
        font-size: 11px;
        font-weight: 700;
        color: #a1a1aa;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .cc-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 11px;
        gap: 10px;
      }
      .cc-setting-label {
        font-size: 11px;
        color: #d4d4d8;
      }
      .cc-setting-sub {
        font-size: 10px;
        color: #71717a;
        margin-top: 1px;
      }
      .cc-setting-text { display: flex; flex-direction: column; }

      .cc-toggle-wrap {
        display: flex;
        align-items: center;
        cursor: pointer;
        flex-shrink: 0;
      }
      .cc-toggle-wrap input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .cc-toggle-track {
        display: block;
        width: 30px;
        height: 17px;
        background: #3f3f46;
        border-radius: 17px;
        position: relative;
        transition: background 0.2s;
      }
      .cc-toggle-wrap input:checked + .cc-toggle-track { background: #f59e0b; }
      .cc-toggle-thumb {
        position: absolute;
        left: 2px;
        top: 2px;
        width: 13px;
        height: 13px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.2s;
      }
      .cc-toggle-wrap input:checked + .cc-toggle-track .cc-toggle-thumb {
        transform: translateX(13px);
      }

      .cc-setting-divider {
        height: 1px;
        background: #3f3f46;
        margin: 0 11px;
      }

      .cc-reset-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 7px 11px 9px;
        padding: 6px 9px;
        background: #27272a;
        border: 1px solid #3f3f46;
        border-radius: 6px;
        color: #a1a1aa;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
        width: calc(100% - 22px);
        text-align: left;
      }
      .cc-reset-btn:hover { background: #3f3f46; color: #f4f4f5; }

      .cc-banner-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 11px;
        border-bottom: 1px solid #3f3f46;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #a1a1aa;
      }
      .cc-banner-row.hidden { display: none; }

      .cc-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .dot-ok   { background: #22c55e; }
      .dot-warn { background: #f59e0b; }
      .dot-none { background: #52525b; }

      .cc-tracker-count-row {
        display: flex;
        align-items: baseline;
        gap: 4px;
        padding: 8px 11px 4px;
      }

      .cc-count-num {
        font-size: 20px;
        font-weight: 800;
        color: #f59e0b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1;
      }

      .cc-count-label {
        font-size: 11px;
        color: #71717a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .cc-list {
        overflow-y: auto;
        max-height: 240px;
        padding: 4px 0 6px;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .cc-list::-webkit-scrollbar { width: 4px; }
      .cc-list::-webkit-scrollbar-track { background: transparent; }
      .cc-list::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }

      .cc-tracker-item {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 11px;
        cursor: help;
        transition: background 0.1s;
        border-radius: 0;
        position: relative;
      }
      .cc-tracker-item:hover { background: #27272a; }

      .cc-tracker-logo {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        object-fit: contain;
        flex-shrink: 0;
        margin-top: 1px;
        background: #3f3f46;
      }

      .cc-tracker-logo-fb {
        width: 14px;
        height: 14px;
        border-radius: 2px;
        background: #3f3f46;
        color: #a1a1aa;
        font-size: 8px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 1px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .cc-tracker-text { flex: 1; min-width: 0; }

      .cc-tracker-name-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .cc-tracker-name {
        font-size: 11px;
        font-weight: 600;
        color: #f4f4f5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .cc-cat {
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;
        flex-shrink: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .cat-advertising { background:#7f1d1d; color:#fca5a5; }
      .cat-analytics   { background:#1e3a5f; color:#93c5fd; }
      .cat-social      { background:#3b0764; color:#d8b4fe; }
      .cat-marketing   { background:#14532d; color:#86efac; }
      .cat-support     { background:#1c1917; color:#a8a29e; }
      .cat-performance { background:#1c2a1c; color:#a3d9a5; }
      .cat-other       { background:#27272a; color:#a1a1aa; }

      .cc-tooltip {
        position: fixed;
        width: 210px;
        background: #1c1c1f;
        border: 1px solid #52525b;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 11px;
        color: #e4e4e7;
        line-height: 1.5;
        pointer-events: none;
        z-index: 2147483647;
        box-shadow: 0 6px 20px rgba(0,0,0,0.7);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: normal;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .cc-tooltip.visible { opacity: 1; }

      /* Right-pointing tail */
      .cc-tooltip::before {
        content: "";
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        border: 7px solid transparent;
        border-left-color: #52525b;
      }
      .cc-tooltip::after {
        content: "";
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        margin-left: -1px;
        border: 6px solid transparent;
        border-left-color: #1c1c1f;
      }

      .cc-empty {
        font-size: 11px;
        color: #52525b;
        text-align: center;
        padding: 14px 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    </style>

    <!-- Pill button -->
    <div class="cc-pill" id="cc-pill" title="Cookiecutter — click to see trackers">
      <svg class="cc-icon" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" rx="24" fill="#f59e0b"/>
        <circle cx="64" cy="64" r="44" fill="#92400e"/>
        <circle cx="64" cy="64" r="38" fill="#b45309"/>
        <ellipse cx="50" cy="52" rx="7" ry="6" fill="#1c0a00" transform="rotate(-15 50 52)"/>
        <ellipse cx="76" cy="48" rx="6" ry="5" fill="#1c0a00" transform="rotate(10 76 48)"/>
        <ellipse cx="58" cy="74" rx="6" ry="5" fill="#1c0a00" transform="rotate(-8 58 74)"/>
        <ellipse cx="80" cy="70" rx="7" ry="6" fill="#1c0a00" transform="rotate(12 80 70)"/>
        <ellipse cx="46" cy="72" rx="5" ry="4" fill="#1c0a00" transform="rotate(-5 46 72)"/>
        <line x1="30" y1="34" x2="98" y2="102" stroke="#fef3c7" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
      </svg>
      <div class="cc-badge zero" id="cc-badge">0</div>
    </div>

    <!-- Expanded panel -->
    <div class="cc-panel" id="cc-panel">
      <div class="cc-panel-header">
        <div class="cc-panel-title-row">
          <svg class="cc-panel-icon" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="128" height="128" rx="24" fill="#f59e0b"/>
            <circle cx="64" cy="64" r="44" fill="#92400e"/>
            <circle cx="64" cy="64" r="38" fill="#b45309"/>
            <ellipse cx="50" cy="52" rx="7" ry="6" fill="#1c0a00" transform="rotate(-15 50 52)"/>
            <ellipse cx="76" cy="48" rx="6" ry="5" fill="#1c0a00" transform="rotate(10 76 48)"/>
            <ellipse cx="58" cy="74" rx="6" ry="5" fill="#1c0a00" transform="rotate(-8 58 74)"/>
            <ellipse cx="80" cy="70" rx="7" ry="6" fill="#1c0a00" transform="rotate(12 80 70)"/>
            <ellipse cx="46" cy="72" rx="5" ry="4" fill="#1c0a00" transform="rotate(-5 46 72)"/>
            <line x1="30" y1="34" x2="98" y2="102" stroke="#fef3c7" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
          </svg>
          <span class="cc-panel-title">Cookiecutter</span>
        </div>
        <div class="cc-header-actions">
          <button class="cc-settings-btn" id="cc-settings-btn" title="Settings">⚙</button>
          <button class="cc-close" id="cc-close" title="Close">✕</button>
        </div>
      </div>

      <div class="cc-banner-row hidden" id="cc-banner-row">
        <span class="cc-status-dot" id="cc-status-dot"></span>
        <span id="cc-banner-text"></span>
      </div>

      <div class="cc-tracker-count-row">
        <span class="cc-count-num" id="cc-count-num">0</span>
        <span class="cc-count-label">trackers on this page</span>
      </div>

      <div class="cc-list" id="cc-list">
        <div class="cc-empty">No trackers detected yet.</div>
      </div>

    </div>
  `;

  document.documentElement.appendChild(host);

  // ── Element refs ─────────────────────────────────────────────────────────

  const pill    = shadow.getElementById("cc-pill");
  const panel   = shadow.getElementById("cc-panel");
  const badge   = shadow.getElementById("cc-badge");
  const closeBtn = shadow.getElementById("cc-close");
  const bannerRow = shadow.getElementById("cc-banner-row");
  const bannerText = shadow.getElementById("cc-banner-text");
  const statusDot = shadow.getElementById("cc-status-dot");
  const countNum  = shadow.getElementById("cc-count-num");
  const list        = shadow.getElementById("cc-list");
  const settingsBtn = shadow.getElementById("cc-settings-btn");

  // ── Build the floating settings popout at shadow-root level ──────────────
  const settingsPopout = document.createElement("div");
  settingsPopout.className = "cc-settings-popout";
  settingsPopout.innerHTML = `
    <div class="cc-sp-header">Settings</div>
    <div class="cc-setting-row">
      <div class="cc-setting-text">
        <span class="cc-setting-label">Enabled on this site</span>
        <span class="cc-setting-sub" id="cc-site-hostname"></span>
      </div>
      <label class="cc-toggle-wrap">
        <input type="checkbox" id="cc-site-toggle" checked />
        <span class="cc-toggle-track"><span class="cc-toggle-thumb"></span></span>
      </label>
    </div>
    <div class="cc-setting-divider"></div>
    <button class="cc-reset-btn" id="cc-reset-pos">↖ Reset position to default</button>
  `;
  shadow.appendChild(settingsPopout);

  const siteToggle   = settingsPopout.querySelector("#cc-site-toggle");
  const siteHostname = settingsPopout.querySelector("#cc-site-hostname");
  const resetPosBtn  = settingsPopout.querySelector("#cc-reset-pos");

  // Shared tooltip — lives at shadow root level so it's not clipped by list overflow
  const sharedTooltip = document.createElement("div");
  sharedTooltip.className = "cc-tooltip";
  shadow.appendChild(sharedTooltip);

  // ── Category labels ───────────────────────────────────────────────────────

  const CAT_LABELS = {
    advertising: "Ads",
    analytics: "Analytics",
    social: "Social",
    marketing: "Marketing",
    support: "Support",
    performance: "Perf",
  };

  const CAT_ORDER = ["advertising", "analytics", "social", "marketing", "support", "performance"];

  // ── Render functions ──────────────────────────────────────────────────────

  function renderBanner() {
    if (!bannerStatus.found) {
      bannerRow.classList.add("hidden");
      return;
    }
    bannerRow.classList.remove("hidden");
    if (bannerStatus.declined) {
      statusDot.className = "cc-status-dot dot-ok";
      bannerText.textContent = "Cookie banner declined";
    } else {
      statusDot.className = "cc-status-dot dot-warn";
      bannerText.textContent = "Banner found — couldn't auto-decline";
    }
  }

  function makeLogo(tracker) {
    if (tracker.logo) {
      const img = document.createElement("img");
      img.src = tracker.logo;
      img.className = "cc-tracker-logo";
      img.alt = "";
      img.onerror = () => img.replaceWith(makeFallback(tracker));
      return img;
    }
    return makeFallback(tracker);
  }

  function makeFallback(tracker) {
    const el = document.createElement("div");
    el.className = "cc-tracker-logo-fb";
    el.textContent = (tracker.company || tracker.name).charAt(0).toUpperCase();
    return el;
  }

  function renderTrackers() {
    countNum.textContent = trackers.length;
    badge.textContent = trackers.length;
    badge.className = "cc-badge" + (trackers.length === 0 ? " zero" : "");

    while (list.firstChild) list.removeChild(list.firstChild);

    if (trackers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cc-empty";
      empty.textContent = "No trackers detected yet.";
      list.appendChild(empty);
      return;
    }

    const sorted = [...trackers].sort((a, b) => {
      const ai = CAT_ORDER.indexOf(a.category) === -1 ? 99 : CAT_ORDER.indexOf(a.category);
      const bi = CAT_ORDER.indexOf(b.category) === -1 ? 99 : CAT_ORDER.indexOf(b.category);
      return ai - bi || a.name.localeCompare(b.name);
    });

    for (const t of sorted) {
      const item = document.createElement("div");
      item.className = "cc-tracker-item";

      const logo = makeLogo(t);

      const text = document.createElement("div");
      text.className = "cc-tracker-text";

      const nameRow = document.createElement("div");
      nameRow.className = "cc-tracker-name-row";

      const name = document.createElement("span");
      name.className = "cc-tracker-name";
      name.textContent = t.name;

      const catKey = (t.category || "other").toLowerCase();
      const cat = document.createElement("span");
      cat.className = `cc-cat cat-${catKey}`;
      cat.textContent = CAT_LABELS[catKey] || t.category;

      nameRow.appendChild(name);
      nameRow.appendChild(cat);

      text.appendChild(nameRow);

      if (t.description) {
        item.addEventListener("mouseenter", () => {
          const rect = item.getBoundingClientRect();
          sharedTooltip.textContent = t.description;
          sharedTooltip.style.top = (rect.top + rect.height / 2) + "px";
          sharedTooltip.style.right = (window.innerWidth - rect.left + 10) + "px";
          sharedTooltip.style.transform = "translateY(-50%)";
          sharedTooltip.classList.add("visible");
        });
        item.addEventListener("mouseleave", () => {
          sharedTooltip.classList.remove("visible");
        });
      }

      item.appendChild(logo);
      item.appendChild(text);
      list.appendChild(item);
    }
  }

  // ── Toggle panel ──────────────────────────────────────────────────────────

  function openPanel() {
    expanded = true;
    panel.classList.add("open");
    renderBanner();
    renderTrackers();
  }

  function closePanel() {
    expanded = false;
    panel.classList.remove("open");
    // close settings popout if open
    settingsOpen = false;
    if (settingsBtn)    settingsBtn.classList.remove("active");
    if (settingsPopout) settingsPopout.classList.remove("visible");
  }

  // ── Drag logic ────────────────────────────────────────────────────────────

  let dragging = false;
  let didDrag  = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const DRAG_THRESHOLD = 4; // px of movement before it's considered a drag

  function startDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = host.getBoundingClientRect();
    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragging    = true;
    didDrag     = false;

    // Convert right-based to left-based so we can move freely
    host.style.right = "";
    host.style.left  = rect.left + "px";
    host.style.top   = rect.top  + "px";

    pill.classList.add("dragging");
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup",   onDragEnd);
  }

  function onDragMove(e) {
    if (!dragging) return;

    if (!didDrag) {
      const dx = Math.abs(e.clientX - dragStartX);
      const dy = Math.abs(e.clientY - dragStartY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) didDrag = true;
    }
    if (!didDrag) return;

    sharedTooltip.classList.remove("visible"); // hide tooltip while dragging

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;

    const maxX = window.innerWidth  - host.offsetWidth;
    const maxY = window.innerHeight - host.offsetHeight;

    host.style.left = Math.max(0, Math.min(x, maxX)) + "px";
    host.style.top  = Math.max(0, Math.min(y, maxY)) + "px";
  }

  function onDragEnd(e) {
    if (!dragging) return;
    dragging = false;
    pill.classList.remove("dragging");

    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup",   onDragEnd);

    if (didDrag) {
      // Persist position so it survives page navigations
      const rect = host.getBoundingClientRect();
      chrome.storage.local.set({
        overlayPos: { left: rect.left, top: rect.top }
      });
    } else {
      // No meaningful movement — treat as a click
      if (expanded) closePanel();
      else openPanel();
    }
  }

  // Attach drag to pill and panel header (both act as drag handles)
  pill.addEventListener("mousedown", startDrag);
  shadow.getElementById("cc-panel-header") && shadow.getElementById("cc-panel-header").addEventListener("mousedown", startDrag);

  // Give the panel header an id so we can grab it
  const panelHeader = panel.querySelector(".cc-panel-header");
  if (panelHeader) {
    panelHeader.style.cursor = "grab";
    panelHeader.addEventListener("mousedown", startDrag);
  }

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePanel();
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  let settingsOpen = false;

  function openSettings() {
    settingsOpen = true;
    settingsBtn.classList.add("active");

    // Position the popout to the left of the panel, aligned with the header
    const panelRect = panel.getBoundingClientRect();
    settingsPopout.style.top   = panelRect.top + "px";
    settingsPopout.style.right = (window.innerWidth - panelRect.left + 8) + "px";

    siteHostname.textContent = location.hostname;
    chrome.runtime.sendMessage(
      { type: "IS_SITE_DISABLED", host: location.hostname },
      (resp) => { siteToggle.checked = !(resp && resp.disabled); }
    );
    settingsPopout.classList.add("visible");
  }

  function closeSettings() {
    settingsOpen = false;
    settingsBtn.classList.remove("active");
    settingsPopout.classList.remove("visible");
  }

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (settingsOpen) closeSettings();
    else openSettings();
  });

  siteToggle.addEventListener("change", () => {
    const enabled = siteToggle.checked;
    chrome.runtime.sendMessage(
      { type: "SET_SITE_ENABLED", host: location.hostname, enabled },
      () => {
        // Hide the whole overlay if disabled
        if (!enabled) {
          closePanel();
          host.style.display = "none";
        }
      }
    );
  });

  resetPosBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.style.left = "";
    host.style.top  = "20px";
    host.style.right = "20px";
    chrome.storage.local.remove("overlayPos");
  });

  // Close on outside click (only if not dragging)
  document.addEventListener("click", (e) => {
    if (didDrag) return;
    if (settingsOpen && !settingsPopout.contains(e.target) && e.target !== settingsBtn) {
      closeSettings();
    }
    if (!host.contains(e.target) && expanded) {
      closePanel();
    }
  });

  // Restore saved position
  chrome.storage.local.get("overlayPos", (data) => {
    if (!data.overlayPos) return;
    const { left, top } = data.overlayPos;
    // Clamp to current viewport in case window was resized
    const maxX = window.innerWidth  - host.offsetWidth  - 2;
    const maxY = window.innerHeight - host.offsetHeight - 2;
    host.style.right = "";
    host.style.left  = Math.max(0, Math.min(left, maxX)) + "px";
    host.style.top   = Math.max(0, Math.min(top,  maxY)) + "px";
  });

  // ── Communication with background ─────────────────────────────────────────

  function applyUpdate(data) {
    if (!data) return;
    if (data.trackers) trackers = data.trackers;
    if (data.banner) bannerStatus = data.banner;

    // Always update badge count
    badge.textContent = trackers.length;
    badge.className = "cc-badge" + (trackers.length === 0 ? " zero" : "");

    // Re-render if open
    if (expanded) {
      renderBanner();
      renderTrackers();
    }
  }

  // Listen for push updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TRACKER_UPDATE") {
      applyUpdate(msg);
    }
    if (msg.type === "BANNER_STATUS_UPDATE") {
      bannerStatus = { found: msg.found, declined: msg.declined };
      if (expanded) renderBanner();
    }
  });

  // Request initial state on load
  chrome.runtime.sendMessage({ type: "GET_MY_TAB_DATA" }, (resp) => {
    if (chrome.runtime.lastError) return;
    applyUpdate(resp);
  });

  // Check if disabled for this site
  chrome.runtime.sendMessage(
    { type: "IS_SITE_DISABLED", host: location.hostname },
    (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.disabled) {
        host.style.display = "none";
      }
    }
  );
})();
