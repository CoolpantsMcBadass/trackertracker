// TrackerTracker — Service Worker
// Intercepts network requests, matches against tracker list, updates badge

const tabTrackers = new Map(); // tabId -> Map(trackerName -> trackerInfo)
const tabBannerStatus = new Map(); // tabId -> { found: bool, declined: bool }
const disabledSites = new Set(); // hostnames where Cookiecutter is disabled
const pushTimers = new Map(); // tabId -> debounce timer for overlay push
const blockedTrackers = new Map(); // trackerName -> domains[]

// ── Blocking via declarativeNetRequest ───────────────────────────────────────

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

// Restore blocked rules from storage on SW startup
chrome.storage.local.get("blockedTrackers", async (data) => {
  if (!data.blockedTrackers) return;
  for (const [name, domains] of Object.entries(data.blockedTrackers)) {
    blockedTrackers.set(name, domains);
    await addBlockRules(domains);
  }
});

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
    for (const [domain, tracker] of domainIndex) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        return tracker;
      }
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

chrome.runtime.onInstalled.addListener(loadTrackers);
chrome.runtime.onStartup.addListener(loadTrackers);

// Load on SW wake-up (in case onInstalled/onStartup didn't fire)
loadTrackers();

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

// Debounced push to overlay content script
function schedulePush(tabId) {
  clearTimeout(pushTimers.get(tabId));
  pushTimers.set(tabId, setTimeout(() => {
    pushTimers.delete(tabId);
    const trackers = tabTrackers.get(tabId);
    if (!trackers) return;
    chrome.tabs.sendMessage(tabId, {
      type: "TRACKER_UPDATE",
      trackers: Array.from(trackers.values()),
    }).catch(() => {}); // tab may not have content script (e.g. chrome:// pages)
  }, 400));
}

// Clear tracker data when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabTrackers.delete(tabId);
    tabBannerStatus.delete(tabId);
    updateBadge(tabId);
  }
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabTrackers.delete(tabId);
  tabBannerStatus.delete(tabId);
});

// Message handler — popup and content script communicate here
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
    // Called by the overlay on load — sender.tab.id is the current tab
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
});

// Restore disabled sites from storage on startup
chrome.storage.local.get("disabledSites", (data) => {
  if (data.disabledSites) {
    for (const host of data.disabledSites) {
      disabledSites.add(host);
    }
  }
});
