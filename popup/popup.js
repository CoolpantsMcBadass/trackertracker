// Cookiecutter — Popup Script

const CATEGORY_LABELS = {
  advertising: "Ads",
  analytics: "Analytics",
  social: "Social",
  marketing: "Marketing",
  support: "Support",
  performance: "Perf",
};

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return null;
  }
}

function makeLogo(tracker) {
  if (tracker.logo) {
    const img = document.createElement("img");
    img.src = tracker.logo;
    img.className = "tracker-logo";
    img.alt = tracker.company || tracker.name;
    img.onerror = () => img.replaceWith(makeFallbackLogo(tracker));
    return img;
  }
  return makeFallbackLogo(tracker);
}

function makeFallbackLogo(tracker) {
  const el = document.createElement("div");
  el.className = "tracker-logo-fallback";
  el.textContent = (tracker.company || tracker.name).charAt(0).toUpperCase();
  return el;
}

function makeTrackerCard(tracker) {
  const card = document.createElement("div");
  card.className = "tracker-card";

  const logo = makeLogo(tracker);

  const info = document.createElement("div");
  info.className = "tracker-info";

  const nameRow = document.createElement("div");
  nameRow.className = "tracker-name-row";

  const name = document.createElement("span");
  name.className = "tracker-name";
  name.textContent = tracker.name;

  const cat = document.createElement("span");
  const catKey = (tracker.category || "other").toLowerCase();
  cat.className = `tracker-category cat-${catKey}`;
  cat.textContent = CATEGORY_LABELS[catKey] || tracker.category;

  nameRow.appendChild(name);
  nameRow.appendChild(cat);

  const desc = document.createElement("p");
  desc.className = "tracker-description";
  desc.textContent = tracker.description || "";

  info.appendChild(nameRow);
  info.appendChild(desc);

  card.appendChild(logo);
  card.appendChild(info);
  return card;
}

function updateBannerUI(banner) {
  const found = document.getElementById("bannerFound");
  const foundOnly = document.getElementById("bannerFoundOnly");
  const none = document.getElementById("bannerNone");

  found.classList.add("hidden");
  foundOnly.classList.add("hidden");
  none.classList.add("hidden");

  if (banner.found && banner.declined) {
    found.classList.remove("hidden");
  } else if (banner.found && !banner.declined) {
    foundOnly.classList.remove("hidden");
  } else {
    none.classList.remove("hidden");
  }
}

function renderTrackers(trackers) {
  const list = document.getElementById("trackerList");
  const empty = document.getElementById("emptyState");
  const count = document.getElementById("trackerCount");

  count.textContent = trackers.length;

  // Clear existing cards (preserve empty state node)
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }

  if (trackers.length === 0) {
    list.appendChild(empty);
    return;
  }

  // Sort: ads first, then analytics, then the rest
  const ORDER = ["advertising", "analytics", "social", "marketing", "support", "performance"];
  trackers.sort((a, b) => {
    const ai = ORDER.indexOf(a.category) === -1 ? 99 : ORDER.indexOf(a.category);
    const bi = ORDER.indexOf(b.category) === -1 ? 99 : ORDER.indexOf(b.category);
    return ai - bi || a.name.localeCompare(b.name);
  });

  for (const tracker of trackers) {
    list.appendChild(makeTrackerCard(tracker));
  }
}

async function init() {
  const tab = await getCurrentTab();
  if (!tab) return;

  const host = getHostname(tab.url);

  // Set up site toggle
  const toggle = document.getElementById("siteToggle");
  const disabledBanner = document.getElementById("disabledBanner");

  // Check current enabled state
  chrome.runtime.sendMessage(
    { type: "GET_SITE_ENABLED", host },
    (resp) => {
      const enabled = resp ? resp.enabled : true;
      toggle.checked = enabled;
      disabledBanner.classList.toggle("hidden", enabled);
    }
  );

  toggle.addEventListener("change", () => {
    chrome.runtime.sendMessage(
      { type: "SET_SITE_ENABLED", host, enabled: toggle.checked },
      () => {
        disabledBanner.classList.toggle("hidden", toggle.checked);
      }
    );
  });

  // Fetch tracker + banner data for this tab
  chrome.runtime.sendMessage(
    { type: "GET_TAB_DATA", tabId: tab.id },
    (resp) => {
      if (!resp) return;
      updateBannerUI(resp.banner);
      renderTrackers(resp.trackers || []);
    }
  );
}

document.addEventListener("DOMContentLoaded", init);
