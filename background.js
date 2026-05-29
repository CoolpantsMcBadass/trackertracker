// Cookiecutter — Service Worker
// Intercepts network requests, matches against tracker list, updates badge

const tabTrackers = new Map(); // tabId -> Map(trackerName -> trackerInfo)
const tabBannerStatus = new Map(); // tabId -> { found: bool, declined: bool }
const disabledSites = new Set(); // hostnames where Cookiecutter is disabled

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
  const color = count > 0 ? "#e74c3c" : "#888888";

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
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
    trackers.set(tracker.name, tracker);
    updateBadge(details.tabId);
  },
  { urls: ["<all_urls>"] }
);

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

  if (msg.type === "BANNER_STATUS") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      tabBannerStatus.set(tabId, {
        found: msg.found,
        declined: msg.declined,
      });
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
});

// Restore disabled sites from storage on startup
chrome.storage.local.get("disabledSites", (data) => {
  if (data.disabledSites) {
    for (const host of data.disabledSites) {
      disabledSites.add(host);
    }
  }
});
