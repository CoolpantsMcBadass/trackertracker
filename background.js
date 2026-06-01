// TrackerTracker - Service Worker
// Intercepts network requests, matches against tracker list, updates badge

const tabTrackers = new Map(); // tabId -> Map(trackerName -> trackerInfo)
const tabBannerStatus = new Map(); // tabId -> { found: bool, declined: bool }
const disabledSites = new Set(); // hostnames where extension is disabled
const pushTimers = new Map(); // tabId -> debounce timer for overlay push
const pushFired = new Map();  // tabId -> bool, true after first push this page load
const blockedTrackers = new Map(); // trackerName -> domains[]

let blockAllEnabled = false; // preemptive block-all currently active
let blockAllDefault = false; // apply block-all automatically on every startup

// ── Blocking via declarativeNetRequest ───────────────────────────────────────

// Individual tracker blocks use IDs 10000–59999 (hash-derived).
// Preemptive block-all uses sequential IDs from 100000 upward (no collisions).
const BLOCK_ALL_ID_BASE = 100000;

// Derive a stable integer rule ID from a domain string (range 10000–59999)
function domainToRuleId(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash) + domain.charCodeAt(i);
    hash |= 0;
  }
  return 10000 + Math.abs(hash) % 50000;
}

const BLOCK_RESOURCE_TYPES = [
  "script", "xmlhttprequest", "image", "stylesheet",
  "font", "media", "websocket", "ping", "sub_frame", "other"
];

async function addBlockRules(domains) {
  const rules = domains.map(domain => ({
    id: domainToRuleId(domain),
    priority: 2,
    action: { type: "block" },
    condition: { urlFilter: `||${domain}`, resourceTypes: BLOCK_RESOURCE_TYPES }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules,
  });
}

async function removeBlockRules(domains) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: domains.map(domainToRuleId),
  });
}

function saveBlockedTrackers() {
  const obj = {};
  for (const [name, domains] of blockedTrackers) obj[name] = domains;
  chrome.storage.local.set({ blockedTrackers: obj });
}

// ── Preemptive block-all ─────────────────────────────────────────────────────

async function enableBlockAll() {
  const rules = [];
  let id = BLOCK_ALL_ID_BASE;
  for (const tracker of trackerList) {
    for (const domain of tracker.domains) {
      rules.push({
        id: id++,
        priority: 3,
        action: { type: "block" },
        condition: { urlFilter: `||${domain}`, resourceTypes: BLOCK_RESOURCE_TYPES }
      });
    }
  }
  // Clear any stale block-all rules before adding fresh ones
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const staleIds = existing.filter(r => r.id >= BLOCK_ALL_ID_BASE).map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: staleIds, addRules: rules });
  blockAllEnabled = true;
  chrome.storage.local.set({ blockAllEnabled: true });
}

async function disableBlockAll() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.filter(r => r.id >= BLOCK_ALL_ID_BASE).map(r => r.id);
  if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  blockAllEnabled = false;
  chrome.storage.local.set({ blockAllEnabled: false });
}

let trackerList = [];
let domainIndex = new Map(); // domain fragment -> tracker entry

async function loadTrackers() {
  const url = chrome.runtime.getURL("data/trackers.json");
  const resp = await fetch(url);
  trackerList = await resp.json();

  domainIndex.clear();
  for (const tracker of trackerList) {
    for (const domain of tracker.domains) {
      domainIndex.set(domain, tracker);
    }
  }
}

function matchTracker(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    // Try from most-specific to least-specific suffix (O(parts) map lookups)
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      const tracker = domainIndex.get(candidate);
      if (tracker) return tracker;
    }
  } catch (_) {}
  return null;
}

function updateBadge(tabId) {
  const trackers = tabTrackers.get(tabId);
  const count = trackers ? trackers.size : 0;
  const text = count > 0 ? String(count) : "";

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#f2e840", tabId });
  chrome.action.setBadgeTextColor({ color: "#1a1a1a", tabId });
}

// Single init - loads trackers first, then restores persisted settings in order
async function init() {
  await loadTrackers();

  const data = await chrome.storage.local.get([
    "blockedTrackers", "disabledSites", "blockAllEnabled", "blockAllDefault"
  ]);

  if (data.disabledSites) {
    for (const host of data.disabledSites) disabledSites.add(host);
  }

  if (data.blockedTrackers) {
    for (const [name, domains] of Object.entries(data.blockedTrackers)) {
      blockedTrackers.set(name, domains);
      await addBlockRules(domains);
    }
  }

  blockAllDefault = data.blockAllDefault || false;

  if (data.blockAllEnabled || blockAllDefault) {
    await enableBlockAll();
  }
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();

// Intercept requests and detect trackers
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const tracker = matchTracker(details.url);
    if (!tracker) return;

    // Check if disabled for this tab's site
    // (We check against stored disabled sites; site check happens via tab URL)
    if (!tabTrackers.has(details.tabId)) {
      tabTrackers.set(details.tabId, new Map());
    }

    const trackers = tabTrackers.get(details.tabId);
    const isNew = !trackers.has(tracker.name);
    trackers.set(tracker.name, tracker);
    updateBadge(details.tabId);

    if (isNew) schedulePush(details.tabId);
  },
  { urls: ["<all_urls>"] }
);

// Push tracker list to overlay. First detection fires immediately; subsequent
// detections within the same page load are debounced to avoid flooding.
function schedulePush(tabId) {
  if (!pushFired.get(tabId)) {
    // First tracker on this page - push right away
    pushFired.set(tabId, true);
    clearTimeout(pushTimers.get(tabId));
    pushTimers.delete(tabId);
    const trackers = tabTrackers.get(tabId);
    if (trackers) {
      chrome.tabs.sendMessage(tabId, {
        type: "TRACKER_UPDATE",
        trackers: Array.from(trackers.values()),
      }).catch(() => {});
    }
  } else {
    // Additional trackers - debounce to batch them
    clearTimeout(pushTimers.get(tabId));
    pushTimers.set(tabId, setTimeout(() => {
      pushTimers.delete(tabId);
      const trackers = tabTrackers.get(tabId);
      if (!trackers) return;
      chrome.tabs.sendMessage(tabId, {
        type: "TRACKER_UPDATE",
        trackers: Array.from(trackers.values()),
      }).catch(() => {});
    }, 400));
  }
}

// Clear tracker data when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabTrackers.delete(tabId);
    tabBannerStatus.delete(tabId);
    pushFired.delete(tabId);
    updateBadge(tabId);
  }
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabTrackers.delete(tabId);
  tabBannerStatus.delete(tabId);
  pushFired.delete(tabId);
});

// Message handler - popup and content script communicate here
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_DATA") {
    const tabId = msg.tabId;
    const trackers = tabTrackers.get(tabId) || new Map();
    const banner = tabBannerStatus.get(tabId) || { found: false, declined: false };

    sendResponse({
      trackers: Array.from(trackers.values()),
      banner,
    });
    return true;
  }

  if (msg.type === "GET_MY_TAB_DATA") {
    // Called by the overlay on load - sender.tab.id is the current tab
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse(null); return true; }
    const trackers = tabTrackers.get(tabId) || new Map();
    const banner = tabBannerStatus.get(tabId) || { found: false, declined: false };
    sendResponse({ trackers: Array.from(trackers.values()), banner });
    return true;
  }

  if (msg.type === "BANNER_STATUS") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      const status = { found: msg.found, declined: msg.declined };
      tabBannerStatus.set(tabId, status);
      // Push banner update to overlay
      chrome.tabs.sendMessage(tabId, { type: "BANNER_STATUS_UPDATE", ...status }).catch(() => {});
    }
    return false;
  }

  if (msg.type === "GET_SITE_ENABLED") {
    sendResponse({ enabled: !disabledSites.has(msg.host) });
    return true;
  }

  if (msg.type === "SET_SITE_ENABLED") {
    if (msg.enabled) {
      disabledSites.delete(msg.host);
    } else {
      disabledSites.add(msg.host);
    }
    // Persist to storage
    chrome.storage.local.set({ disabledSites: Array.from(disabledSites) });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "IS_SITE_DISABLED") {
    sendResponse({ disabled: disabledSites.has(msg.host) });
    return true;
  }

  if (msg.type === "GET_BLOCKED_TRACKERS") {
    sendResponse({ blocked: Array.from(blockedTrackers.keys()) });
    return true;
  }

  if (msg.type === "GET_ALL_TRACKERS") {
    sendResponse({ trackers: trackerList });
    return true;
  }

  if (msg.type === "BLOCK_TRACKER") {
    const tracker = trackerList.find(t => t.name === msg.name);
    if (!tracker) { sendResponse({ ok: false }); return true; }
    blockedTrackers.set(tracker.name, tracker.domains);
    addBlockRules(tracker.domains).then(() => {
      saveBlockedTrackers();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "UNBLOCK_TRACKER") {
    const domains = blockedTrackers.get(msg.name) || [];
    blockedTrackers.delete(msg.name);
    removeBlockRules(domains).then(() => {
      saveBlockedTrackers();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_BLOCK_ALL") {
    sendResponse({ enabled: blockAllEnabled, default: blockAllDefault });
    return true;
  }

  if (msg.type === "SET_BLOCK_ALL") {
    const fn = msg.enabled ? enableBlockAll : disableBlockAll;
    fn().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "SET_BLOCK_ALL_DEFAULT") {
    blockAllDefault = msg.enabled;
    chrome.storage.local.set({ blockAllDefault: msg.enabled });
    sendResponse({ ok: true });
    return true;
  }
});

