// TrackerTracker - Page Overlay
// Floating panel injected into pages via Shadow DOM.

(function () {
  "use strict";

  if (document.getElementById("trackertracker-host")) return;

  // ── State ──────────────────────────────────────────────────────────────────
  let trackers     = [];
  let bannerStatus = { found: false, declined: false };
  let expanded     = false;
  let activeTab    = "page"; // "page" | "settings"
  let blockedSet    = new Set();
  let blockAllActive = false; // true when block-all is enabled; used alongside blockedSet
  let blockAllExcludedCats = ["support"]; // categories exempt from block-all
  let allTrackers  = null;   // cached full list for blocklist
  let searchQuery  = "";
  let lightMode    = false;

  function isEffectivelyBlocked(t) {
    if (blockedSet.has(t.name)) return true;
    if (blockAllActive && !blockAllExcludedCats.includes((t.category || "").toLowerCase())) return true;
    return false;
  }

  const CAT_ORDER  = ["advertising","analytics","social","marketing","support","performance","other"];
  const CAT_LABELS = {
    advertising:"Advertising", analytics:"Analytics", social:"Social",
    marketing:"Marketing", support:"Support", performance:"Performance", other:"Other"
  };
  const CAT_BADGE  = {
    advertising:"Ads", analytics:"Analytics", social:"Social",
    marketing:"Marketing", support:"Support", performance:"Perf", other:"Other"
  };

  // ── Shadow DOM ─────────────────────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "trackertracker-host";
  Object.assign(host.style, {
    position:"fixed", top:"20px", right:"20px",
    zIndex:"2147483647", fontFamily:"inherit", lineHeight:"normal",
  });

  const shadow = host.attachShadow({ mode:"closed" });

  shadow.innerHTML = `
  <style>
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    :host { all:initial; }

    /* ── Pill ── */
    .cc-pill {
      display:flex; align-items:center; gap:6px;
      background:#15191e; border:1px solid #2a3347;
      border-radius:20px; padding:6px 11px 6px 8px;
      cursor:pointer; user-select:none;
      box-shadow:0 2px 16px rgba(0,0,0,0.6);
      transition:background 0.15s, border-color 0.15s;
      white-space:nowrap;
    }
    .cc-pill:hover { background:#1c2233; border-color:#3d5170; }
    .cc-pill.dragging { cursor:grabbing !important; }
    .cc-pill.cc-site-disabled { opacity:0.4; filter:grayscale(1); }

    .cc-icon { width:18px; height:18px; flex-shrink:0; }

    .cc-badge {
      font-size:12px; font-weight:700; color:#dde4f0; line-height:1;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .cc-badge.zero { color:#3d5170; }

    /* ── Panel ── */
    .cc-panel {
      position:absolute; top:calc(100% + 8px); right:0;
      width:300px; background:#15191e;
      border:1px solid #2a3347; border-radius:10px;
      box-shadow:0 6px 30px rgba(0,0,0,0.7);
      overflow:hidden; display:none; flex-direction:column;
      max-height:480px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .cc-panel.open { display:flex; }

    /* Header */
    .cc-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 12px 9px; border-bottom:1px solid #2a3347;
      cursor:grab; flex-shrink:0;
    }
    .cc-header:active { cursor:grabbing; }
    .cc-header-left { display:flex; align-items:center; gap:7px; }
    .cc-header-right { display:flex; align-items:center; gap:2px; }
    .cc-header-icon { width:16px; height:16px; flex-shrink:0; }
    .cc-header-title {
      font-size:13px; font-weight:700; color:#dde4f0; letter-spacing:-0.01em;
    }
    .cc-gear-btn {
      background:none; border:none; color:#3d5170; cursor:pointer;
      width:22px; height:22px; border-radius:4px; display:flex;
      align-items:center; justify-content:center; padding:0;
      transition:color 0.1s, background 0.1s; flex-shrink:0;
    }
    .cc-gear-btn svg { width:14px; height:14px; }
    .cc-gear-btn:hover { color:#dde4f0; background:#1c2233; }
    .cc-gear-btn.active { color:#f2e840; }
    .cc-close {
      background:none; border:none; color:#3d5170; cursor:pointer;
      width:20px; height:20px; border-radius:4px; display:flex;
      align-items:center; justify-content:center; font-size:13px;
      transition:color 0.1s, background 0.1s; flex-shrink:0;
    }
    .cc-close:hover { color:#dde4f0; background:#1c2233; }

    /* Search */
    .cc-search-row {
      display:flex; align-items:center; gap:8px;
      padding:7px 12px; border-bottom:1px solid #2a3347; flex-shrink:0;
    }
    .cc-search-icon { width:13px; height:13px; color:#3d5170; flex-shrink:0; }
    .cc-search-input {
      flex:1; background:none; border:none; outline:none;
      color:#dde4f0; font-size:12px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .cc-search-input::placeholder { color:#3d5170; }

    /* Tab content */
    .cc-tab { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
    .cc-tab.hidden { display:none; }
    .cc-tab::-webkit-scrollbar { width:4px; }
    .cc-tab::-webkit-scrollbar-track { background:transparent; }
    .cc-tab::-webkit-scrollbar-thumb { background:#2a3347; border-radius:4px; }

    /* Banner chip */
    .cc-banner-chip {
      margin:8px 12px 0; padding:5px 8px; border-radius:4px;
      font-size:11px; display:flex; align-items:center; gap:5px; flex-shrink:0;
    }
    .cc-banner-chip.chip-ok   { background:rgba(34,197,94,0.12); color:#4ade80; }
    .cc-banner-chip.chip-warn { background:rgba(245,158,11,0.12); color:#fbbf24; }
    .cc-banner-chip.chip-none { background:#1c2233; color:#5d7190; }
    .cc-banner-chip.hidden    { display:none; }

    /* Summary row */
    .cc-summary {
      display:flex; align-items:baseline; gap:5px;
      padding:8px 12px 4px; flex-shrink:0;
    }
    .cc-count { font-size:22px; font-weight:800; color:#f2e840; line-height:1; }
    .cc-count-label { font-size:11px; color:#5d7190; }

    /* Category section */
    .cc-cat-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:5px 12px 3px; position:sticky; top:0;
      background:#15191e; z-index:1;
    }
    .cc-cat-name {
      font-size:10px; font-weight:700; letter-spacing:0.08em;
      text-transform:uppercase; color:#3d5170;
    }
    .cc-cat-count { font-size:10px; font-weight:600; color:#3d5170; }

    /* Tracker row */
    .cc-row {
      display:flex; align-items:center; gap:8px;
      padding:6px 12px; transition:background 0.1s; cursor:default;
      position:relative;
    }
    .cc-row:hover { background:#1c2233; }

    .cc-row-logo {
      width:18px; height:18px; border-radius:3px; flex-shrink:0;
      object-fit:contain; background:#1c2233;
    }
    .cc-row-logo-fb {
      width:18px; height:18px; border-radius:3px; flex-shrink:0;
      background:#1c2233; display:flex; align-items:center; justify-content:center;
      font-size:8px; font-weight:700; color:#5d7190;
    }
    .cc-row-name {
      flex:1; font-size:11px; font-weight:600; color:#dde4f0;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .cc-row-cat {
      font-size:9px; font-weight:700; text-transform:uppercase;
      letter-spacing:0.04em; padding:1px 4px; border-radius:3px;
      white-space:nowrap; flex-shrink:0;
    }

    /* Block button */
    .cc-block-btn {
      background:none; border:none; color:#2a3347; cursor:pointer;
      font-size:14px; line-height:1; padding:0 1px; flex-shrink:0;
      opacity:0; transition:opacity 0.1s,color 0.1s;
    }
    .cc-row:hover .cc-block-btn { opacity:1; }
    .cc-block-btn:hover { color:#ef4444; }
    .cc-block-btn.blocked { opacity:1; color:#ef4444; }
    .cc-row.is-blocked .cc-row-name { opacity:0.35; text-decoration:line-through; }
    .cc-row.is-blocked .cc-row-cat  { opacity:0.35; }
    .cc-row.is-blocked .cc-row-logo,
    .cc-row.is-blocked .cc-row-logo-fb { opacity:0.35; }

    /* Category badge colours */
    .cat-advertising { background:#7f1d1d; color:#fca5a5; }
    .cat-analytics   { background:#1e3a5f; color:#93c5fd; }
    .cat-social      { background:#3b0764; color:#d8b4fe; }
    .cat-marketing   { background:#14532d; color:#86efac; }
    .cat-support     { background:#1c1917; color:#a8a29e; }
    .cat-performance { background:#1c2a1c; color:#a3d9a5; }
    .cat-other       { background:#1c2233; color:#5d7190; }

    /* Tooltip */
    .cc-tooltip {
      position:fixed; width:200px; background:#0d111a;
      border:1px solid #2a3347; border-radius:8px;
      padding:8px 10px; font-size:11px; color:#c8d4e8; line-height:1.5;
      pointer-events:none; z-index:2147483647;
      box-shadow:0 6px 20px rgba(0,0,0,0.7);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      white-space:normal; opacity:0; transition:opacity 0.15s;
    }
    .cc-tooltip.visible { opacity:1; }
    .cc-tooltip::before {
      content:""; position:absolute; left:100%; top:50%;
      transform:translateY(-50%); border:6px solid transparent;
      border-left-color:#2a3347;
    }
    .cc-tooltip::after {
      content:""; position:absolute; left:100%; top:50%;
      transform:translateY(-50%); margin-left:-1px;
      border:5px solid transparent; border-left-color:#0d111a;
    }

    /* Empty state */
    .cc-empty {
      font-size:11px; color:#3d5170; text-align:center; padding:20px 0;
    }

    /* ── Settings tab ── */
    .cc-settings-group { padding:8px 0 2px; }
    .cc-settings-label {
      font-size:10px; font-weight:700; letter-spacing:0.08em;
      text-transform:uppercase; color:#3d5170; padding:0 12px 4px;
    }
    .cc-setting-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 12px; gap:10px; transition:background 0.1s;
    }
    .cc-setting-row:hover { background:#1c2233; }
    .cc-setting-text { flex:1; min-width:0; }
    .cc-setting-name { display:block; font-size:12px; font-weight:500; color:#dde4f0; }
    .cc-setting-sub  {
      display:block; font-size:10px; color:#5d7190; margin-top:1px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }

    /* Toggle */
    .cc-toggle { display:flex; align-items:center; cursor:pointer; flex-shrink:0; }
    .cc-toggle input { position:absolute; opacity:0; width:0; height:0; }
    .cc-track {
      display:block; width:30px; height:17px; background:#1c2233;
      border:1px solid #2a3347; border-radius:17px; position:relative;
      transition:background 0.2s, border-color 0.2s;
    }
    .cc-toggle input:checked + .cc-track { background:#f2e840; border-color:#f2e840; }
    .cc-thumb {
      position:absolute; left:2px; top:2px; width:11px; height:11px;
      background:#fff; border-radius:50%; transition:transform 0.2s;
    }
    .cc-toggle input:checked + .cc-track .cc-thumb { transform:translateX(13px); }

    .cc-settings-divider { height:1px; background:#2a3347; margin:4px 0; }

    /* Blocklist */
    .cc-bl-search-row { display:flex; align-items:center; gap:6px; padding:0 12px 6px; }
    .cc-bl-search {
      flex:1; background:#1c2233; border:1px solid #2a3347; border-radius:5px;
      color:#dde4f0; font-size:11px; padding:5px 8px; outline:none;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .cc-bl-search::placeholder { color:#3d5170; }
    .cc-bl-search:focus { border-color:#5d7190; }
    .cc-bl-filter {
      display:flex; align-items:center; gap:4px;
      padding:0 12px 5px; cursor:pointer; user-select:none;
    }
    .cc-bl-filter input[type="checkbox"] {
      accent-color:#f2e840; width:11px; height:11px;
      margin:0; cursor:pointer; flex-shrink:0; position:static; opacity:1;
    }
    .cc-bl-filter-label { font-size:10px; color:#5d7190; }
    .cc-bl-list { max-height:160px; overflow-y:auto; }
    .cc-bl-list::-webkit-scrollbar { width:4px; }
    .cc-bl-list::-webkit-scrollbar-track { background:transparent; }
    .cc-bl-list::-webkit-scrollbar-thumb { background:#2a3347; border-radius:4px; }
    .cc-bl-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:5px 12px; gap:8px; transition:background 0.1s;
    }
    .cc-bl-row:hover { background:#1c2233; }
    .cc-bl-row-left { display:flex; align-items:center; gap:5px; min-width:0; flex:1; }
    .cc-bl-name { font-size:11px; color:#c8d4e8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cc-bl-empty, .cc-bl-loading { font-size:11px; color:#3d5170; text-align:center; padding:12px 0; }

    /* Reset button */
    .cc-reset-btn {
      display:flex; align-items:center; gap:5px;
      margin:6px 12px 8px; padding:6px 9px;
      background:#1c2233; border:1px solid #2a3347; border-radius:6px;
      color:#5d7190; font-size:11px; cursor:pointer; width:calc(100% - 24px);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      transition:background 0.1s, color 0.1s;
    }
    .cc-reset-btn:hover { background:#232d3f; color:#dde4f0; }

    /* ── Light mode ── */
    :host(.cc-light) .cc-pill { background:#f8f9fb; border-color:#d4dae8; box-shadow:0 2px 12px rgba(0,0,0,0.1); }
    :host(.cc-light) .cc-pill:hover { background:#eef1f7; border-color:#b0b8cc; }
    :host(.cc-light) .cc-badge { color:#1a2333; }
    :host(.cc-light) .cc-badge.zero { color:#8b9abf; }
    :host(.cc-light) .cc-panel { background:#f8f9fb; border-color:#d4dae8; box-shadow:0 6px 24px rgba(0,0,0,0.12); }
    :host(.cc-light) .cc-header { border-bottom-color:#d4dae8; }
    :host(.cc-light) .cc-header-title { color:#1a2333; }
    :host(.cc-light) .cc-gear-btn { color:#8b9abf; }
    :host(.cc-light) .cc-gear-btn:hover { color:#1a2333; background:#eef1f7; }
    :host(.cc-light) .cc-gear-btn.active { color:#c8ba00; }
    :host(.cc-light) .cc-close { color:#8b9abf; }
    :host(.cc-light) .cc-close:hover { color:#1a2333; background:#eef1f7; }
    :host(.cc-light) .cc-search-row { border-bottom-color:#d4dae8; }
    :host(.cc-light) .cc-search-input { color:#1a2333; }
    :host(.cc-light) .cc-search-input::placeholder { color:#8b9abf; }
    :host(.cc-light) .cc-search-icon { color:#8b9abf; }
    :host(.cc-light) .cc-tab::-webkit-scrollbar-thumb { background:#d4dae8; }
    :host(.cc-light) .cc-banner-chip.chip-none { background:#eef1f7; color:#6b7a99; }
    :host(.cc-light) .cc-count { color:#c8ba00; }
    :host(.cc-light) .cc-count-label { color:#6b7a99; }
    :host(.cc-light) .cc-cat-header { background:#f8f9fb; }
    :host(.cc-light) .cc-cat-name,
    :host(.cc-light) .cc-cat-count { color:#8b9abf; }
    :host(.cc-light) .cc-row:hover { background:#eef1f7; }
    :host(.cc-light) .cc-row-logo { background:#eef1f7; }
    :host(.cc-light) .cc-row-logo-fb { background:#eef1f7; color:#6b7a99; }
    :host(.cc-light) .cc-row-name { color:#1a2333; }
    :host(.cc-light) .cc-empty { color:#8b9abf; }
    :host(.cc-light) .cc-settings-label { color:#8b9abf; }
    :host(.cc-light) .cc-setting-row:hover { background:#eef1f7; }
    :host(.cc-light) .cc-setting-name { color:#1a2333; }
    :host(.cc-light) .cc-setting-sub { color:#6b7a99; }
    :host(.cc-light) .cc-track { background:#eef1f7; border-color:#d4dae8; }
    :host(.cc-light) .cc-toggle input:checked + .cc-track { background:#c8ba00; border-color:#c8ba00; }
    :host(.cc-light) .cc-settings-divider { background:#d4dae8; }
    :host(.cc-light) .cc-bl-search { background:#ffffff; border-color:#d4dae8; color:#1a2333; }
    :host(.cc-light) .cc-bl-search::placeholder { color:#8b9abf; }
    :host(.cc-light) .cc-bl-filter-label { color:#6b7a99; }
    :host(.cc-light) .cc-bl-row:hover { background:#eef1f7; }
    :host(.cc-light) .cc-bl-name { color:#1a2333; }
    :host(.cc-light) .cc-bl-empty,
    :host(.cc-light) .cc-bl-loading { color:#8b9abf; }
    :host(.cc-light) .cc-reset-btn { background:#ffffff; border-color:#d4dae8; color:#6b7a99; }
    :host(.cc-light) .cc-reset-btn:hover { background:#eef1f7; color:#1a2333; }
    :host(.cc-light) .cc-tooltip { background:#ffffff; border-color:#d4dae8; color:#1a2333; box-shadow:0 4px 16px rgba(0,0,0,0.1); }
    :host(.cc-light) .cc-tooltip::before { border-left-color:#d4dae8; }
    :host(.cc-light) .cc-tooltip::after { border-left-color:#ffffff; }
    :host(.cc-light) .cat-advertising { background:#fce7e7; color:#991b1b; }
    :host(.cc-light) .cat-analytics   { background:#dbeafe; color:#1e40af; }
    :host(.cc-light) .cat-social      { background:#ede9fe; color:#5b21b6; }
    :host(.cc-light) .cat-marketing   { background:#dcfce7; color:#15803d; }
    :host(.cc-light) .cat-support     { background:#f5f5f4; color:#44403c; }
    :host(.cc-light) .cat-performance { background:#f0fdf4; color:#166534; }
    :host(.cc-light) .cat-other       { background:#eef1f7; color:#6b7a99; }

  </style>

  <!-- Pill -->
  <div class="cc-pill" id="cc-pill" title="TrackerTracker">
    <svg class="cc-icon" viewBox="0 0 128 128" fill="none">
      <rect width="128" height="128" rx="26" fill="#5e8c6a"/>
      <path d="M16 46C14 26,34 16,50 32C55 37,60 41,64 41C68 41,73 37,78 32C94 16,114 26,112 46C110 42,96 28,80 40C75 44,70 47,64 47C58 47,53 44,48 40C32 28,18 42,16 46Z" fill="#1c1c1c"/>
      <ellipse cx="64" cy="70" rx="26" ry="23" fill="#f2e840"/>
      <ellipse cx="64" cy="64" rx="13" ry="13" fill="#cc2020"/>
      <circle cx="69" cy="58" r="3.5" fill="white" opacity="0.88"/>
    </svg>
    <div class="cc-badge zero" id="cc-badge">0</div>
  </div>

  <!-- Panel -->
  <div class="cc-panel" id="cc-panel">

    <div class="cc-header" id="cc-header">
      <div class="cc-header-left">
        <svg class="cc-header-icon" viewBox="0 0 128 128" fill="none">
          <rect width="128" height="128" rx="26" fill="#5e8c6a"/>
          <path d="M16 46C14 26,34 16,50 32C55 37,60 41,64 41C68 41,73 37,78 32C94 16,114 26,112 46C110 42,96 28,80 40C75 44,70 47,64 47C58 47,53 44,48 40C32 28,18 42,16 46Z" fill="#1c1c1c"/>
          <ellipse cx="64" cy="70" rx="26" ry="23" fill="#f2e840"/>
          <ellipse cx="64" cy="64" rx="13" ry="13" fill="#cc2020"/>
          <circle cx="69" cy="58" r="3.5" fill="white" opacity="0.88"/>
        </svg>
        <span class="cc-header-title">TrackerTracker</span>
      </div>
      <div class="cc-header-right">
        <button class="cc-gear-btn" id="cc-gear-btn" title="Settings">
          <svg viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M4.1 15.9l1.4-1.4M14.5 5.5l1.4-1.4"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="cc-close" id="cc-close" title="Close">✕</button>
      </div>
    </div>

    <div class="cc-search-row" id="cc-search-row">
      <svg class="cc-search-icon" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input class="cc-search-input" id="cc-search" placeholder="Filter trackers…" type="text" />
    </div>

    <!-- This Page tab -->
    <div class="cc-tab" id="cc-tab-page">
      <div id="cc-banner-chip" class="cc-banner-chip hidden"></div>
      <div class="cc-summary">
        <span class="cc-count" id="cc-count">0</span>
        <span class="cc-count-label">trackers on this page so far</span>
      </div>
      <div id="cc-list"></div>
    </div>

    <!-- Settings tab -->
    <div class="cc-tab hidden" id="cc-tab-settings">

      <div class="cc-settings-group">
        <div class="cc-settings-label">This site</div>
        <div class="cc-setting-row">
          <div class="cc-setting-text">
            <span class="cc-setting-name">Enabled</span>
            <span class="cc-setting-sub" id="cc-site-hostname"></span>
          </div>
          <label class="cc-toggle">
            <input type="checkbox" id="cc-site-toggle" checked />
            <span class="cc-track"><span class="cc-thumb"></span></span>
          </label>
        </div>
      </div>

      <div class="cc-settings-divider"></div>

      <div class="cc-settings-group">
        <div class="cc-settings-label">Blocking</div>
        <div class="cc-setting-row">
          <div class="cc-setting-text">
            <span class="cc-setting-name">Block all trackers</span>
            <span class="cc-setting-sub">Blocks all trackers except support</span>
          </div>
          <label class="cc-toggle">
            <input type="checkbox" id="cc-block-all-global" />
            <span class="cc-track"><span class="cc-thumb"></span></span>
          </label>
        </div>
        <div class="cc-setting-row">
          <div class="cc-setting-text">
            <span class="cc-setting-name">Block by default</span>
            <span class="cc-setting-sub">Always on across sessions</span>
          </div>
          <label class="cc-toggle">
            <input type="checkbox" id="cc-block-all-default" />
            <span class="cc-track"><span class="cc-thumb"></span></span>
          </label>
        </div>
      </div>

      <div class="cc-settings-divider"></div>

      <div class="cc-settings-group">
        <div class="cc-settings-label">Appearance</div>
        <div class="cc-setting-row">
          <div class="cc-setting-text">
            <span class="cc-setting-name">Light mode</span>
            <span class="cc-setting-sub">Switch to light theme</span>
          </div>
          <label class="cc-toggle">
            <input type="checkbox" id="cc-light-mode" />
            <span class="cc-track"><span class="cc-thumb"></span></span>
          </label>
        </div>
      </div>

      <div class="cc-settings-divider"></div>

      <div class="cc-settings-group">
        <div class="cc-settings-label">Tracker blocklist</div>
        <div class="cc-bl-search-row">
          <input class="cc-bl-search" id="cc-bl-search" placeholder="Filter 3435 trackers…" type="text" />
        </div>
        <label class="cc-bl-filter">
          <input type="checkbox" id="cc-bl-blocked-only" checked />
          <span class="cc-bl-filter-label">Blocked only</span>
        </label>
        <div class="cc-bl-list" id="cc-bl-list">
          <div class="cc-bl-loading">Loading…</div>
        </div>
      </div>

      <div class="cc-settings-divider"></div>
      <button class="cc-reset-btn" id="cc-reset-pos">↖ Reset overlay position</button>

    </div>

  </div>
  `;

  document.documentElement.appendChild(host);

  // ── Element refs ───────────────────────────────────────────────────────────
  const pill        = shadow.getElementById("cc-pill");
  const panel       = shadow.getElementById("cc-panel");
  const badge       = shadow.getElementById("cc-badge");
  const closeBtn    = shadow.getElementById("cc-close");
  const gearBtn     = shadow.getElementById("cc-gear-btn");
  const panelHeader = shadow.getElementById("cc-header");
  const searchInput = shadow.getElementById("cc-search");
  const searchRow   = shadow.getElementById("cc-search-row");
  const bannerChip  = shadow.getElementById("cc-banner-chip");
  const countEl     = shadow.getElementById("cc-count");
  const list        = shadow.getElementById("cc-list");

  const tabPage     = shadow.getElementById("cc-tab-page");
  const tabSettings = shadow.getElementById("cc-tab-settings");

  const siteToggle      = shadow.getElementById("cc-site-toggle");
  const siteHostname    = shadow.getElementById("cc-site-hostname");
  const blockAllGlobal  = shadow.getElementById("cc-block-all-global");
  const blockAllDefault = shadow.getElementById("cc-block-all-default");
  const lightModeToggle = shadow.getElementById("cc-light-mode");
  const resetPosBtn     = shadow.getElementById("cc-reset-pos");
  const blSearch        = shadow.getElementById("cc-bl-search");
  const blBlockedOnly   = shadow.getElementById("cc-bl-blocked-only");
  const blList          = shadow.getElementById("cc-bl-list");

  // Tooltip (lives at shadow root level to avoid overflow clipping)
  const tooltip = document.createElement("div");
  tooltip.className = "cc-tooltip";
  shadow.appendChild(tooltip);

  // ── Tab switching ──────────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    tabPage.classList.toggle("hidden", tab !== "page");
    tabSettings.classList.toggle("hidden", tab !== "settings");
    searchRow.style.display = tab === "page" ? "" : "none";
    gearBtn.classList.toggle("active", tab === "settings");
    if (tab === "settings") loadBlocklist();
    if (tab === "page") renderTrackers();
  }

  gearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    switchTab(activeTab === "settings" ? "page" : "settings");
  });

  // ── Render: banner chip ────────────────────────────────────────────────────
  function renderBanner() {
    bannerChip.className = "cc-banner-chip";
    if (bannerStatus.found && bannerStatus.declined) {
      bannerChip.classList.add("chip-ok");
      bannerChip.textContent = "✓  Cookie banner declined";
    } else if (bannerStatus.found) {
      bannerChip.classList.add("chip-warn");
      bannerChip.textContent = "!  Banner found - couldn't auto-decline";
    } else {
      bannerChip.classList.add("chip-none");
      bannerChip.textContent = "–  No cookie banner detected";
    }
  }

  // ── Render: tracker list ───────────────────────────────────────────────────
  function makeLogo(t) {
    if (t.logo) {
      const img = document.createElement("img");
      img.src = t.logo; img.className = "cc-row-logo"; img.alt = "";
      img.onerror = () => img.replaceWith(makeFallback(t));
      return img;
    }
    return makeFallback(t);
  }

  function makeFallback(t) {
    const el = document.createElement("div");
    el.className = "cc-row-logo-fb";
    el.textContent = (t.company || t.name)[0].toUpperCase();
    return el;
  }

  function renderTrackers() {
    countEl.textContent = trackers.length;
    badge.textContent   = trackers.length;
    badge.className     = "cc-badge" + (trackers.length === 0 ? " zero" : "");

    while (list.firstChild) list.removeChild(list.firstChild);

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? trackers.filter(t => t.name.toLowerCase().includes(q) || (t.company||"").toLowerCase().includes(q))
      : trackers;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cc-empty";
      empty.textContent = q ? `No trackers matching "${searchQuery}".` : "No trackers detected yet.";
      list.appendChild(empty);
      return;
    }

    const groups = {};
    for (const t of filtered) {
      const cat = (t.category || "other").toLowerCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }

    for (const cat of CAT_ORDER) {
      const items = groups[cat];
      if (!items || items.length === 0) continue;

      const section = document.createElement("div");

      const catHeader = document.createElement("div");
      catHeader.className = "cc-cat-header";
      const catNameEl = document.createElement("span");
      catNameEl.className = "cc-cat-name";
      catNameEl.textContent = CAT_LABELS[cat] || cat;
      const catCountEl = document.createElement("span");
      catCountEl.className = "cc-cat-count";
      catCountEl.textContent = items.length;
      catHeader.appendChild(catNameEl);
      catHeader.appendChild(catCountEl);
      section.appendChild(catHeader);

      for (const t of items.sort((a,b) => a.name.localeCompare(b.name))) {
        const isBlocked = isEffectivelyBlocked(t);
        const row = document.createElement("div");
        row.className = "cc-row" + (isBlocked ? " is-blocked" : "");

        const logo = makeLogo(t);

        const name = document.createElement("span");
        name.className = "cc-row-name";
        name.textContent = t.name;

        const catKey = (t.category || "other").toLowerCase();
        const catBadge = document.createElement("span");
        catBadge.className = `cc-row-cat cat-${catKey}`;
        catBadge.textContent = CAT_BADGE[catKey] || catKey;

        // Description on hover via tooltip
        if (t.description) {
          row.addEventListener("mouseenter", () => {
            const rect = row.getBoundingClientRect();
            tooltip.textContent = t.description;
            tooltip.style.top       = (rect.top + rect.height / 2) + "px";
            tooltip.style.right     = (window.innerWidth - rect.left + 8) + "px";
            tooltip.style.transform = "translateY(-50%)";
            tooltip.classList.add("visible");
          });
          row.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
        }

        // Block button
        const blockBtn = document.createElement("button");
        blockBtn.className = "cc-block-btn" + (isBlocked ? " blocked" : "");
        blockBtn.textContent = "⊘";
        blockBtn.title = isBlocked ? "Unblock" : "Block";
        blockBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          tooltip.classList.remove("visible");
          const nowBlocked = isEffectivelyBlocked(t);
          chrome.runtime.sendMessage(
            { type: nowBlocked ? "UNBLOCK_TRACKER" : "BLOCK_TRACKER", name: t.name },
            () => {
              if (chrome.runtime.lastError) return;
              if (nowBlocked) blockedSet.delete(t.name);
              else            blockedSet.add(t.name);
              const stillBlocked = isEffectivelyBlocked(t);
              row.classList.toggle("is-blocked", stillBlocked);
              blockBtn.classList.toggle("blocked", stillBlocked);
              blockBtn.title = stillBlocked ? "Unblock" : "Block";
            }
          );
        });

        row.appendChild(logo);
        row.appendChild(name);
        row.appendChild(catBadge);
        row.appendChild(blockBtn);
        section.appendChild(row);
      }

      list.appendChild(section);
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTrackers();
  });

  // ── Panel open/close ───────────────────────────────────────────────────────
  function openPanel() {
    expanded = true;
    panel.classList.add("open");
    // If site is disabled, land on settings so user can re-enable immediately
    if (pill.classList.contains("cc-site-disabled")) {
      switchTab("settings");
    } else {
      renderBanner();
      renderTrackers();
      switchTab(activeTab);
    }
  }

  function closePanel() {
    expanded = false;
    panel.classList.remove("open");
    tooltip.classList.remove("visible");
    activeTab = "page";
  }

  // ── Drag logic ─────────────────────────────────────────────────────────────
  let dragging = false, didDrag = false;
  let dragStartX = 0, dragStartY = 0, dragOffsetX = 0, dragOffsetY = 0;
  const DRAG_THRESHOLD = 4;

  function startDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest("button,input,label,a,select")) return;
    e.preventDefault(); e.stopPropagation();

    const rect = host.getBoundingClientRect();
    dragStartX  = e.clientX; dragStartY  = e.clientY;
    dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
    dragging = true; didDrag = false;

    host.style.right = ""; host.style.left = rect.left + "px"; host.style.top = rect.top + "px";
    pill.classList.add("dragging");
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup",   onDragEnd);
  }

  function onDragMove(e) {
    if (!dragging) return;
    if (!didDrag) {
      const dx = Math.abs(e.clientX - dragStartX), dy = Math.abs(e.clientY - dragStartY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) didDrag = true;
    }
    if (!didDrag) return;
    tooltip.classList.remove("visible");
    const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth  - host.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - host.offsetHeight));
    host.style.left = x + "px"; host.style.top = y + "px";
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    pill.classList.remove("dragging");
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup",   onDragEnd);
    const wasDrag = didDrag;
    didDrag = false; // reset so click-outside works normally after dragging
    if (wasDrag) {
      const rect = host.getBoundingClientRect();
      chrome.storage.local.set({ overlayPos: { left: rect.left, top: rect.top } });
    } else {
      if (expanded) closePanel(); else openPanel();
    }
  }

  pill.addEventListener("mousedown", startDrag);
  panelHeader.addEventListener("mousedown", startDrag);

  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closePanel(); });

  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(host)) closePanel();
  });

  // ── Settings wiring ────────────────────────────────────────────────────────
  siteHostname.textContent = location.hostname;

  chrome.runtime.sendMessage({ type:"IS_SITE_DISABLED", host:location.hostname }, (resp) => {
    const disabled = resp && resp.disabled;
    siteToggle.checked = !disabled;
    pill.classList.toggle("cc-site-disabled", !!disabled);
  });

  siteToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage(
      { type:"SET_SITE_ENABLED", host:location.hostname, enabled:siteToggle.checked },
      () => {
        pill.classList.toggle("cc-site-disabled", !siteToggle.checked);
        if (!siteToggle.checked) closePanel();
      }
    );
  });

  chrome.runtime.sendMessage({ type:"GET_BLOCK_ALL" }, (resp) => {
    if (!resp) return;
    blockAllGlobal.checked  = resp.enabled;
    blockAllDefault.checked = resp.default;
    blockAllActive = resp.enabled;
    if (resp.excludedCats) blockAllExcludedCats = resp.excludedCats;
    if (expanded && activeTab === "page") renderTrackers();
    renderBlocklist();
  });

  blockAllGlobal.addEventListener("change", () => {
    blockAllActive = blockAllGlobal.checked;
    chrome.runtime.sendMessage({ type:"SET_BLOCK_ALL", enabled:blockAllGlobal.checked }, () => {});
    if (!blockAllGlobal.checked && blockAllDefault.checked) {
      blockAllDefault.checked = false;
      chrome.runtime.sendMessage({ type:"SET_BLOCK_ALL_DEFAULT", enabled:false }, () => {});
    }
    if (expanded && activeTab === "page") renderTrackers();
    renderBlocklist();
  });

  blockAllDefault.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type:"SET_BLOCK_ALL_DEFAULT", enabled:blockAllDefault.checked }, () => {});
    if (blockAllDefault.checked && !blockAllGlobal.checked) {
      blockAllGlobal.checked = true;
      chrome.runtime.sendMessage({ type:"SET_BLOCK_ALL", enabled:true }, () => {});
    }
  });

  // ── Light mode ─────────────────────────────────────────────────────────────
  chrome.storage.local.get("overlayTheme", ({ overlayTheme }) => {
    if (overlayTheme === "light") {
      host.classList.add("cc-light");
      lightModeToggle.checked = true;
      lightMode = true;
    }
  });

  lightModeToggle.addEventListener("change", () => {
    lightMode = lightModeToggle.checked;
    host.classList.toggle("cc-light", lightMode);
    chrome.storage.local.set({ overlayTheme: lightMode ? "light" : "dark" });
  });

  resetPosBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    host.style.left = ""; host.style.top = "20px"; host.style.right = "20px";
    chrome.storage.local.remove("overlayPos");
  });

  // ── Blocklist ──────────────────────────────────────────────────────────────
  function renderBlocklist() {
    const q = blSearch.value.trim().toLowerCase();
    const blockedOnly = blBlockedOnly.checked;
    let items = allTrackers || [];
    if (blockedOnly) items = items.filter(t => isEffectivelyBlocked(t));
    if (q) items = items.filter(t => t.name.toLowerCase().includes(q) || (t.category||"").toLowerCase().includes(q));

    while (blList.firstChild) blList.removeChild(blList.firstChild);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cc-bl-empty";
      empty.textContent = "No trackers match.";
      blList.appendChild(empty);
      return;
    }

    for (const t of items) {
      const row = document.createElement("div");
      row.className = "cc-bl-row";

      const left = document.createElement("div");
      left.className = "cc-bl-row-left";

      const nameEl = document.createElement("span");
      nameEl.className = "cc-bl-name";
      nameEl.textContent = t.name;

      const catKey = (t.category || "other").toLowerCase();
      const catEl = document.createElement("span");
      catEl.className = `cc-row-cat cat-${catKey}`;
      catEl.textContent = CAT_BADGE[catKey] || catKey;
      catEl.style.flexShrink = "0";

      left.appendChild(nameEl);
      left.appendChild(catEl);

      const lbl = document.createElement("label");
      lbl.className = "cc-toggle"; lbl.style.flexShrink = "0";
      const chk = document.createElement("input"); chk.type = "checkbox";
      chk.checked  = isEffectivelyBlocked(t);
      chk.disabled = blockAllActive && !blockAllExcludedCats.includes((t.category || "").toLowerCase());
      const track = document.createElement("span"); track.className = "cc-track";
      track.innerHTML = '<span class="cc-thumb"></span>';
      lbl.appendChild(chk); lbl.appendChild(track);

      chk.addEventListener("change", () => {
        chrome.runtime.sendMessage(
          { type: chk.checked ? "BLOCK_TRACKER" : "UNBLOCK_TRACKER", name:t.name },
          () => {
            if (chrome.runtime.lastError) return;
            if (chk.checked) blockedSet.add(t.name); else blockedSet.delete(t.name);
            if (expanded && activeTab === "page") renderTrackers();
            renderBlocklist();
          }
        );
      });

      row.appendChild(left); row.appendChild(lbl);
      blList.appendChild(row);
    }
  }

  function loadBlocklist() {
    if (allTrackers) { renderBlocklist(); return; }
    blList.innerHTML = '<div class="cc-bl-loading">Loading…</div>';
    chrome.runtime.sendMessage({ type:"GET_ALL_TRACKERS" }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      allTrackers = resp.trackers.slice().sort((a,b) => a.name.localeCompare(b.name));
      blSearch.placeholder = `Filter ${allTrackers.length} trackers…`;
      renderBlocklist();
    });
  }

  blSearch.addEventListener("input", renderBlocklist);
  blBlockedOnly.addEventListener("change", renderBlocklist);

  // ── Incoming data ──────────────────────────────────────────────────────────
  function applyUpdate(data) {
    if (!data) return;
    if (data.trackers) trackers = data.trackers;
    if (data.banner)   bannerStatus = data.banner;
    badge.textContent = trackers.length;
    badge.className   = "cc-badge" + (trackers.length === 0 ? " zero" : "");
    if (expanded && activeTab === "page") { renderBanner(); renderTrackers(); }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TRACKER_UPDATE")       applyUpdate(msg);
    if (msg.type === "BANNER_STATUS_UPDATE") {
      bannerStatus = { found:msg.found, declined:msg.declined };
      if (expanded && activeTab === "page") renderBanner();
    }
  });

  chrome.runtime.sendMessage({ type:"GET_MY_TAB_DATA" }, (resp) => {
    if (!resp) return;
    trackers     = resp.trackers || [];
    bannerStatus = resp.banner   || { found:false, declined:false };
    badge.textContent = trackers.length;
    badge.className   = "cc-badge" + (trackers.length === 0 ? " zero" : "");
    chrome.runtime.sendMessage({ type:"GET_BLOCKED_TRACKERS" }, (r) => {
      if (r && r.blocked) r.blocked.forEach(n => blockedSet.add(n));
    });
  });

  chrome.storage.local.get("overlayPos", (data) => {
    if (!data.overlayPos) return;
    const { left, top } = data.overlayPos;
    const maxX = window.innerWidth  - host.offsetWidth  - 2;
    const maxY = window.innerHeight - host.offsetHeight - 2;
    host.style.right = "";
    host.style.left  = Math.max(0, Math.min(left, maxX)) + "px";
    host.style.top   = Math.max(0, Math.min(top,  maxY)) + "px";
  });

})();
