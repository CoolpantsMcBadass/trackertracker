// Cookiecutter — Content Script
// Detects and auto-declines cookie consent banners

(function () {
  "use strict";

  let bannerFound = false;
  let bannerDeclined = false;

  // ── Known consent platform selectors ─────────────────────────────────────

  const PLATFORM_SELECTORS = [
    // OneTrust
    {
      name: "OneTrust",
      rejectBtn: [
        "#onetrust-reject-all-handler",
        ".ot-pc-refuse-all-handler",
        "#onetrust-pc-btn-handler",
      ],
      banner: "#onetrust-banner-sdk",
    },
    // Cookiebot
    {
      name: "Cookiebot",
      rejectBtn: [
        "#CybotCookiebotDialogBodyButtonDecline",
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
      ],
      banner: "#CybotCookiebotDialog",
    },
    // TrustArc
    {
      name: "TrustArc",
      rejectBtn: [
        ".trustecm-reject-all-handler",
        "#truste-consent-required",
        ".pdynamicbutton .required",
      ],
      banner: "#truste-consent-track",
    },
    // Osano
    {
      name: "Osano",
      rejectBtn: [".osano-cm-denyAll", ".osano-cm-decline"],
      banner: ".osano-cm-window",
    },
    // Termly
    {
      name: "Termly",
      rejectBtn: ["[data-tid='banner-decline']"],
      banner: "#termly-code-snippet-support",
    },
    // Didomi
    {
      name: "Didomi",
      rejectBtn: ["#didomi-notice-disagree-button"],
      banner: "#didomi-popup",
    },
    // Quantcast / GDPR tools
    {
      name: "Quantcast",
      rejectBtn: [".qc-cmp2-summary-buttons button:last-child"],
      banner: ".qc-cmp2-container",
    },
    // Usercentrics
    {
      name: "Usercentrics",
      rejectBtn: ["[data-testid='uc-deny-all-button']"],
      banner: "#usercentrics-root",
    },
    // Consentmanager
    {
      name: "Consentmanager",
      rejectBtn: [".cmpboxbtnno", "#cmpwelcomebtnno"],
      banner: "#cmpbox",
    },
    // CookieYes
    {
      name: "CookieYes",
      rejectBtn: [
        ".cky-btn-reject",
        "[data-cky-tag='reject-button']",
      ],
      banner: ".cky-consent-bar",
    },
  ];

  // ── Fuzzy text matching for generic banners ───────────────────────────────

  const REJECT_PHRASES = [
    "reject all",
    "decline all",
    "refuse all",
    "deny all",
    "reject cookies",
    "decline cookies",
    "necessary only",
    "essential only",
    "only necessary",
    "only essential",
    "use necessary cookies",
    "accept necessary",
    "manage preferences",  // lower priority — only if nothing else found
  ];

  const ACCEPT_PHRASES = [
    "accept all",
    "accept cookies",
    "i accept",
    "agree",
    "got it",
    "ok",
    "allow all",
    "consent to all",
  ];

  const BANNER_KEYWORDS = [
    "cookie",
    "consent",
    "privacy",
    "gdpr",
    "ccpa",
    "tracking",
    "we use",
  ];

  function normalizeText(text) {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function looksLikeBanner(el) {
    const text = normalizeText(el.innerText || "");
    return BANNER_KEYWORDS.some((kw) => text.includes(kw));
  }

  function findRejectButton(container) {
    const buttons = Array.from(
      container.querySelectorAll("button, a[role='button'], input[type='button'], [role='button']")
    );

    // Score each button
    let best = null;
    let bestScore = -1;

    for (const btn of buttons) {
      const text = normalizeText(btn.innerText || btn.value || btn.getAttribute("aria-label") || "");
      if (!text) continue;

      // Deprioritize accept buttons
      if (ACCEPT_PHRASES.some((p) => text.includes(p))) continue;

      let score = 0;
      for (let i = 0; i < REJECT_PHRASES.length; i++) {
        if (text.includes(REJECT_PHRASES[i])) {
          // Earlier phrases score higher
          score = Math.max(score, REJECT_PHRASES.length - i);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = btn;
      }
    }

    return bestScore > 0 ? best : null;
  }

  // ── Platform-specific attempt ─────────────────────────────────────────────

  function tryPlatformSelectors() {
    for (const platform of PLATFORM_SELECTORS) {
      const banner = document.querySelector(platform.banner);
      if (!banner || !isVisible(banner)) continue;

      for (const sel of platform.rejectBtn) {
        const btn = banner.querySelector(sel) || document.querySelector(sel);
        if (btn && isVisible(btn)) {
          bannerFound = true;
          btn.click();
          bannerDeclined = true;
          reportStatus();
          return true;
        }
      }

      // Banner found but no reject button identified via selector — flag it
      bannerFound = true;
      reportStatus();
    }
    return false;
  }

  // ── Generic banner attempt ────────────────────────────────────────────────

  function tryGenericBanner() {
    // Look for fixed/sticky overlays that mention cookies
    const candidates = Array.from(
      document.querySelectorAll(
        "div[class*='cookie'], div[class*='consent'], div[class*='gdpr'], " +
        "div[id*='cookie'], div[id*='consent'], div[id*='gdpr'], " +
        "section[class*='cookie'], aside[class*='cookie'], " +
        "div[class*='privacy'], div[id*='privacy']"
      )
    );

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      if (!looksLikeBanner(el)) continue;

      const rejectBtn = findRejectButton(el);
      if (rejectBtn) {
        bannerFound = true;
        rejectBtn.click();
        bannerDeclined = true;
        reportStatus();
        return true;
      }
    }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      (rect.width > 0 || rect.height > 0)
    );
  }

  function reportStatus() {
    chrome.runtime.sendMessage({
      type: "BANNER_STATUS",
      found: bannerFound,
      declined: bannerDeclined,
    }).catch(() => {});
  }

  // ── Main attempt logic ────────────────────────────────────────────────────

  function attempt() {
    if (bannerDeclined) return;

    // Check if site is disabled
    chrome.runtime.sendMessage(
      { type: "IS_SITE_DISABLED", host: location.hostname },
      (resp) => {
        if (chrome.runtime.lastError) return;
        if (resp && resp.disabled) return;
        run();
      }
    );
  }

  function run() {
    if (tryPlatformSelectors()) return;
    tryGenericBanner();
  }

  // ── MutationObserver for late-loading banners ─────────────────────────────

  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    if (bannerDeclined) {
      observer.disconnect();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(attempt, 300);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial attempt on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attempt);
  } else {
    attempt();
  }

  // Stop observing after 30 seconds (most banners load within 10s)
  setTimeout(() => observer.disconnect(), 30000);

  // ── Handle iframes ────────────────────────────────────────────────────────
  // Content script runs in all frames by default (all_frames: true would be needed
  // for cross-origin iframes — added as a future enhancement in manifest).
})();
