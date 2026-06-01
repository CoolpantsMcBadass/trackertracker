// TrackerTracker - Popup

const CATEGORY_ORDER  = ["advertising", "analytics", "social", "marketing", "support", "performance", "other"];
const CATEGORY_LABELS = {
  advertising: "Ads",
  analytics:   "Analytics",
  social:      "Social",
  marketing:   "Marketing",
  support:     "Support",
  performance: "Perf",
  other:       "Other",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hostname(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function makeLogo(tracker) {
  if (tracker.logo) {
    const img = document.createElement("img");
    img.src = tracker.logo;
    img.className = "tt-row-logo";
    img.alt = "";
    img.onerror = () => img.replaceWith(makeFallback(tracker));
    return img;
  }
  return makeFallback(tracker);
}

function makeFallback(tracker) {
  const el = document.createElement("div");
  el.className = "tt-row-logo-fb";
  el.textContent = (tracker.company || tracker.name)[0].toUpperCase();
  return el;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderTrackers(trackers, query) {
  const list  = document.getElementById("tt-tracker-list");
  const empty = document.getElementById("tt-empty");
  const count = document.getElementById("tt-count");

  count.textContent = trackers.length;
  list.innerHTML = "";

  const q = query.trim().toLowerCase();
  const filtered = q
    ? trackers.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.company || "").toLowerCase().includes(q))
    : trackers;

  if (filtered.length === 0) {
    list.appendChild(empty);
    empty.classList.remove("hidden");
    empty.textContent = q ? `No trackers matching "${query}".` : "No trackers detected yet.";
    return;
  }

  // Group by category
  const groups = {};
  for (const t of filtered) {
    const cat = (t.category || "other").toLowerCase();
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }

  for (const cat of CATEGORY_ORDER) {
    const items = groups[cat];
    if (!items || items.length === 0) continue;

    const section = document.createElement("div");
    section.className = "tt-cat-section";

    const header = document.createElement("div");
    header.className = "tt-cat-header";
    header.innerHTML = `
      <span class="tt-cat-name">${CATEGORY_LABELS[cat] || cat}</span>
      <span class="tt-cat-count">${items.length}</span>
    `;
    section.appendChild(header);

    for (const t of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const row = document.createElement("div");
      row.className = "tt-row";
      if (t.description) row.title = t.description;

      const logo = makeLogo(t);

      const name = document.createElement("span");
      name.className = "tt-row-name";
      name.textContent = t.name;

      const badge = document.createElement("span");
      badge.className = `tt-row-cat cat-${cat}`;
      badge.textContent = CATEGORY_LABELS[cat] || cat;

      row.appendChild(logo);
      row.appendChild(name);
      row.appendChild(badge);
      section.appendChild(row);
    }

    list.appendChild(section);
  }
}

function updateBanner(banner) {
  const chip = document.getElementById("tt-banner-chip");
  chip.className = "tt-banner-chip";

  if (banner.found && banner.declined) {
    chip.classList.add("chip-ok");
    chip.textContent = "✓  Cookie banner declined";
  } else if (banner.found) {
    chip.classList.add("chip-warn");
    chip.textContent = "!  Cookie banner found - couldn't auto-decline";
  } else {
    chip.classList.add("chip-none");
    chip.textContent = "–  No cookie banner detected";
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll(".tt-tab-content").forEach(el => el.classList.add("hidden"));
  document.getElementById(`tt-tab-${tab}`).classList.remove("hidden");
  document.getElementById("tt-gear-btn").classList.toggle("active", tab === "settings");
  document.querySelector(".tt-search-row").style.display = tab === "page" ? "" : "none";
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const host = hostname(tab.url);

  document.getElementById("tt-site-host").textContent    = host || "";
  document.getElementById("tt-setting-host").textContent = host || "";

  let allTrackers = [];
  let searchQuery = "";

  // ── Search ──
  document.getElementById("tt-search").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTrackers(allTrackers, searchQuery);
  });

  // ── Gear button ──
  document.getElementById("tt-gear-btn").addEventListener("click", () => {
    const onSettings = !document.getElementById("tt-tab-settings").classList.contains("hidden");
    switchTab(onSettings ? "page" : "settings");
  });

  // ── Site toggle ──
  const siteToggle = document.getElementById("tt-site-toggle");
  chrome.runtime.sendMessage({ type: "GET_SITE_ENABLED", host }, (resp) => {
    siteToggle.checked = resp ? resp.enabled : true;
  });
  siteToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "SET_SITE_ENABLED", host, enabled: siteToggle.checked });
  });

  // ── Block-all toggles ──
  const blockAll     = document.getElementById("tt-block-all");
  const blockDefault = document.getElementById("tt-block-default");

  chrome.runtime.sendMessage({ type: "GET_BLOCK_ALL" }, (resp) => {
    if (!resp) return;
    blockAll.checked     = resp.enabled;
    blockDefault.checked = resp.default;
  });

  blockAll.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "SET_BLOCK_ALL", enabled: blockAll.checked });
    if (!blockAll.checked && blockDefault.checked) {
      blockDefault.checked = false;
      chrome.runtime.sendMessage({ type: "SET_BLOCK_ALL_DEFAULT", enabled: false });
    }
  });

  blockDefault.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "SET_BLOCK_ALL_DEFAULT", enabled: blockDefault.checked });
    if (blockDefault.checked && !blockAll.checked) {
      blockAll.checked = true;
      chrome.runtime.sendMessage({ type: "SET_BLOCK_ALL", enabled: true });
    }
  });

  // ── Light mode ──
  const lightToggle = document.getElementById("tt-light-mode");
  chrome.storage.local.get("popupTheme", ({ popupTheme }) => {
    if (popupTheme === "light") {
      document.body.classList.add("tt-light");
      lightToggle.checked = true;
    }
  });
  lightToggle.addEventListener("change", () => {
    document.body.classList.toggle("tt-light", lightToggle.checked);
    chrome.storage.local.set({ popupTheme: lightToggle.checked ? "light" : "dark" });
  });

  // ── Tracker + banner data ──
  chrome.runtime.sendMessage({ type: "GET_TAB_DATA", tabId: tab.id }, (resp) => {
    if (!resp) return;
    allTrackers = resp.trackers || [];
    updateBanner(resp.banner);
    renderTrackers(allTrackers, searchQuery);
  });
}

document.addEventListener("DOMContentLoaded", init);
