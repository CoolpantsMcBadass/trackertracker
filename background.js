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

// Individual tracker blocks use IDs 10000–99999 (sequential, no collisions).
// Preemptive block-all uses sequential IDs from 100000 upward.
const BLOCK_ALL_ID_BASE = 100000;
const INDIVIDUAL_ID_MIN = 10000;

const domainRuleIds = new Map(); // domain -> assigned DNR rule ID
let nextIndividualRuleId = INDIVIDUAL_ID_MIN;

function saveRuleIdMap() {
  const obj = {};
  for (const [domain, id] of domainRuleIds) obj[domain] = id;
  chrome.storage.local.set({ ruleIdMap: obj });
}

const BLOCK_RESOURCE_TYPES = [
  "script", "xmlhttprequest", "image",
  "media", "websocket", "ping", "sub_frame", "other"
];

async function addBlockRules(domains) {
  const rules = [];
  for (const domain of domains) {
    let id = domainRuleIds.get(domain);
    if (id === undefined) {
      if (nextIndividualRuleId >= BLOCK_ALL_ID_BASE) {
        console.warn("[TrackerTracker] individual block rule ID space full, skipping", domain);
        continue;
      }
      id = nextIndividualRuleId++;
      domainRuleIds.set(domain, id);
    }
    rules.push({
      id,
      priority: 2,
      action: { type: "block" },
      condition: { urlFilter: `||${domain}`, resourceTypes: BLOCK_RESOURCE_TYPES }
    });
  }
  if (!rules.length) return;
  // Remove first so re-adding after a SW restart doesn't fail on duplicate IDs
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules,
  });
  saveRuleIdMap();
}

async function removeBlockRules(domains) {
  const toRemove = [];
  for (const domain of domains) {
    const id = domainRuleIds.get(domain);
    if (id !== undefined) toRemove.push({ domain, id });
  }
  if (!toRemove.length) return;
  // Mutate memory only after the DNR call succeeds - if it throws, the map
  // stays intact so the rule IDs aren't permanently lost.
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove.map(x => x.id) });
  for (const { domain } of toRemove) domainRuleIds.delete(domain);
  saveRuleIdMap();
}

function saveBlockedTrackers() {
  const obj = {};
  for (const [name, domains] of blockedTrackers) obj[name] = domains;
  chrome.storage.local.set({ blockedTrackers: obj });
}

// ── Site-level allow rules (override block-all for disabled sites) ───────────

// When block-all is active, each disabled site gets a priority-4 allow rule so
// its own requests bypass the priority-3 block-all rules.
const SITE_ALLOW_ID_BASE = 200000;
const siteAllowRuleIds = new Map(); // hostname -> DNR rule ID
let nextSiteAllowRuleId = SITE_ALLOW_ID_BASE;

async function addSiteAllowRule(host) {
  if (!blockAllEnabled) return;
  if (siteAllowRuleIds.has(host)) return;
  const id = nextSiteAllowRuleId++;
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id,
      priority: 4,
      action: { type: "allow" },
      condition: { initiatorDomains: [host], resourceTypes: BLOCK_RESOURCE_TYPES }
    }]
  });
  siteAllowRuleIds.set(host, id);
}

async function removeSiteAllowRule(host) {
  const id = siteAllowRuleIds.get(host);
  if (id === undefined) return;
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [id] });
  siteAllowRuleIds.delete(host);
}

async function removeAllSiteAllowRules() {
  const ids = Array.from(siteAllowRuleIds.values());
  if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  siteAllowRuleIds.clear();
  nextSiteAllowRuleId = SITE_ALLOW_ID_BASE;
}

// ── Preemptive block-all ─────────────────────────────────────────────────────

const BLOCK_ALL_EXCLUDED_CATS = ["support", "performance", "other"];

async function enableBlockAll() {
  const rules = [];
  let id = BLOCK_ALL_ID_BASE;
  for (const tracker of trackerList) {
    if (BLOCK_ALL_EXCLUDED_CATS.includes((tracker.category || "").toLowerCase())) continue;
    for (const domain of tracker.domains) {
      rules.push({
        id: id++,
        priority: 3,
        action: { type: "block" },
        condition: { urlFilter: `||${domain}`, resourceTypes: BLOCK_RESOURCE_TYPES }
      });
    }
  }
  // Clear stale block-all rules in a separate call first so removal succeeds
  // even if the subsequent add fails (atomic combined calls roll back on failure).
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const staleIds = existing.filter(r => r.id >= BLOCK_ALL_ID_BASE).map(r => r.id);
  if (staleIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: staleIds });
  }
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  } catch (err) {
    console.error("[TrackerTracker] enableBlockAll failed:", err);
    throw err;
  }
  blockAllEnabled = true;

  // Add allow rules for any sites already disabled so block-all doesn't break them
  for (const host of disabledSites) {
    try { await addSiteAllowRule(host); } catch (err) {
      console.error("[TrackerTracker] failed to add site-allow rule for", host, err);
    }
  }
}

async function disableBlockAll() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = existing.filter(r => r.id >= BLOCK_ALL_ID_BASE).map(r => r.id);
    if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
    blockAllEnabled = false;
    // Site-allow rules are only meaningful while block-all is active; clean them up
    await removeAllSiteAllowRules();
  } catch (err) {
    console.error("[TrackerTracker] disableBlockAll failed:", err);
    throw err;
  }
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
  try {
    await loadTrackers();
  } catch (err) {
    console.error("[TrackerTracker] failed to load tracker database:", err);
    return; // can't function without tracker data; initPromise resolves (not rejects) so handlers still register
  }

  const data = await chrome.storage.local.get([
    "blockedTrackers", "disabledSites", "blockAllDefault", "ruleIdMap"
  ]);

  if (data.disabledSites) {
    for (const host of data.disabledSites) disabledSites.add(host);
  }

  // Restore domain -> rule ID assignments so sequential IDs stay stable
  // across SW restarts and we never reuse or collide IDs.
  if (data.ruleIdMap) {
    for (const [domain, id] of Object.entries(data.ruleIdMap)) {
      domainRuleIds.set(domain, id);
    }
    let maxId = INDIVIDUAL_ID_MIN - 1;
    for (const id of domainRuleIds.values()) { if (id > maxId) maxId = id; }
    nextIndividualRuleId = Math.min(maxId + 1, BLOCK_ALL_ID_BASE - 1);
  }

  // Always clear stale block-all rules first. Block-all is session-only unless
  // blockAllDefault is set, and a previously failed enableBlockAll() could leave
  // orphaned rules in Chrome's DNR store that keep blocking even when the toggle
  // shows as off. Clearing unconditionally before re-enabling if needed is safe.
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const staleBlockAllIds = existing.filter(r => r.id >= BLOCK_ALL_ID_BASE).map(r => r.id);
  if (staleBlockAllIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: staleBlockAllIds });
  }

  if (data.blockedTrackers) {
    for (const [name, domains] of Object.entries(data.blockedTrackers)) {
      blockedTrackers.set(name, domains);
      try {
        await addBlockRules(domains);
      } catch (err) {
        console.error("[TrackerTracker] failed to restore block rules for", name, err);
      }
    }
  }

  blockAllDefault = data.blockAllDefault || false;

  if (blockAllDefault) {
    try {
      await enableBlockAll();
    } catch (err) {
      console.error("[TrackerTracker] failed to re-enable block-all on startup:", err);
    }
  }
}

// Single deduped init - covers fresh install, browser startup, and mid-session SW restarts.
// onInstalled/onStartup are redundant in MV3 because the SW always runs module-level code on start.
const initPromise = init();

// Intercept requests and detect trackers
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const tracker = matchTracker(details.url);
    if (!tracker) return;

    // Skip detection entirely if the extension is disabled for this page
    if (details.initiator) {
      try {
        if (disabledSites.has(new URL(details.initiator).hostname)) return;
      } catch (_) {}
    }

    if (!tabTrackers.has(details.tabId)) {
      tabTrackers.set(details.tabId, new Map());
    }

    const trackers = tabTrackers.get(details.tabId);
    const isNew = !trackers.has(tracker.name);
    trackers.set(tracker.name, tracker);
    updateBadge(details.tabId);

    if (isNew) schedulePush(details.tabId);
  },
  { urls: ["<all_urls>"], types: ["script", "xmlhttprequest", "websocket", "ping", "sub_frame"] }
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
    clearTimeout(pushTimers.get(tabId));
    pushTimers.delete(tabId);
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
    initPromise.then(() => sendResponse({ enabled: !disabledSites.has(msg.host) }));
    return true;
  }

  if (msg.type === "SET_SITE_ENABLED") {
    initPromise.then(async () => {
      if (msg.enabled) {
        disabledSites.delete(msg.host);
        try { await removeSiteAllowRule(msg.host); } catch (_) {}
      } else {
        disabledSites.add(msg.host);
        try { await addSiteAllowRule(msg.host); } catch (_) {}
      }
      chrome.storage.local.set({ disabledSites: Array.from(disabledSites) });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "IS_SITE_DISABLED") {
    initPromise.then(() => sendResponse({ disabled: disabledSites.has(msg.host) }));
    return true;
  }

  if (msg.type === "GET_BLOCKED_TRACKERS") {
    initPromise.then(() => sendResponse({ blocked: Array.from(blockedTrackers.keys()) }));
    return true;
  }

  if (msg.type === "GET_ALL_TRACKERS") {
    initPromise.then(() => sendResponse({ trackers: trackerList }));
    return true;
  }

  if (msg.type === "BLOCK_TRACKER") {
    initPromise.then(() => {
      const tracker = trackerList.find(t => t.name === msg.name);
      if (!tracker) { sendResponse({ ok: false }); return; }
      blockedTrackers.set(tracker.name, tracker.domains);
      addBlockRules(tracker.domains).then(() => {
        saveBlockedTrackers();
        sendResponse({ ok: true });
      }).catch(err => {
        console.error("[TrackerTracker] BLOCK_TRACKER failed:", err);
        blockedTrackers.delete(tracker.name);
        sendResponse({ ok: false });
      });
    });
    return true;
  }

  if (msg.type === "UNBLOCK_TRACKER") {
    initPromise.then(() => {
      const domains = blockedTrackers.get(msg.name) || [];
      blockedTrackers.delete(msg.name);
      removeBlockRules(domains).then(() => {
        saveBlockedTrackers();
        sendResponse({ ok: true });
      }).catch(err => {
        console.error("[TrackerTracker] UNBLOCK_TRACKER failed:", err);
        blockedTrackers.set(msg.name, domains);
        sendResponse({ ok: false });
      });
    });
    return true;
  }

  if (msg.type === "GET_BLOCK_ALL") {
    initPromise.then(() => sendResponse({ enabled: blockAllEnabled, default: blockAllDefault, excludedCats: BLOCK_ALL_EXCLUDED_CATS }));
    return true;
  }

  if (msg.type === "SET_BLOCK_ALL") {
    initPromise.then(() => {
      const fn = msg.enabled ? enableBlockAll : disableBlockAll;
      fn().then(() => sendResponse({ ok: true })).catch(err => {
        console.error("[TrackerTracker] SET_BLOCK_ALL failed:", err);
        sendResponse({ ok: false });
      });
    });
    return true;
  }

  if (msg.type === "SET_BLOCK_ALL_DEFAULT") {
    blockAllDefault = msg.enabled;
    chrome.storage.local.set({ blockAllDefault: msg.enabled });
    sendResponse({ ok: true });
    return true;
  }
});

