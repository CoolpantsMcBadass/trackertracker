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

      .cc-close {
        background: none;
        border: none;
        color: #71717a;
        font-size: 13px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        transition: color 0.1s, background 0.1s;
      }
      .cc-close:hover { color: #f4f4f5; background: #3f3f46; }

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
        <button class="cc-close" id="cc-close" title="Close">✕</button>
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
  const list      = shadow.getElementById("cc-list");

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
  }

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expanded) {
      closePanel();
    } else {
      openPanel();
    }
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePanel();
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!host.contains(e.target) && expanded) {
      closePanel();
    }
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
