# TrackerTracker Changelog

All notable changes to this project are documented here.

---

## [1.0.4] - 2026-06-02

### Fixed
- background.js: excluded performance and other categories from block-all in addition to support. Performance covers CDN/infrastructure (Akamai, Azure CDN, CloudFront); other covers broad platform domains like `office.com` whose `||office.com` DNR rule was blocking all of Outlook's API calls to `substrate.office.com` and other subdomains, causing Outlook Web to show a connection error.
- background.js: added site-level allow rules (priority 4, `initiatorDomains`) for disabled sites when block-all is active, so per-site disable properly overrides block-all for requests originating from that page.

---

## [1.0.3] - 2026-06-02

### Fixed
- overlay.js: panel now resets to tracker list tab when closed, so reopening always shows trackers not settings
- overlay.js: changed 'trackers on this page' to 'trackers on this page so far' to imply detection is ongoing

### Fixed (fix 1/8)
- background.js: replaced hash-based domainToRuleId (birthday paradox ~64% collision chance with 10k+ domains) with sequential ID counter + persisted ruleIdMap; IDs are now stable across SW restarts and guaranteed unique; added saveRuleIdMap(), updated addBlockRules/removeBlockRules to use map, updated init() to restore map and seed nextIndividualRuleId from max existing ID

### Fixed (fix 2/8)
- background.js: wrapped addBlockRules and enableBlockAll calls in init() with try/catch - a failure in either no longer rejects initPromise, which would have silently broken all message handlers that depend on it

### Fixed (fix 3/8)
- background.js: added types filter to webRequest.onBeforeRequest listener - now only fires for script, xmlhttprequest, websocket, ping, sub_frame; trackers only phone home via these types so detection is unchanged, but listener no longer runs on every image/font/CSS request

### Fixed (fix 4/8)
- background.js: webRequest listener now checks details.initiator against disabledSites before doing anything; badge no longer increments and trackers no longer stored for disabled sites
- overlay.js: overlay now hides itself on load if the site is disabled, not just when the toggle is changed mid-session

### Fixed (fix 4b/8)
- overlay.js: disabled sites no longer hide the pill entirely - pill stays visible but grayed out/desaturated; clicking it opens settings tab directly so the user can re-enable; fixes the lockout where disabling a site made the overlay inaccessible

### Fixed (fix 5/8)
- content.js: cached IS_SITE_DISABLED result per page load; previously sent a background message on every MutationObserver debounce (every 300ms of DOM activity); the enabled state can't change mid-page so one check per load is sufficient

### Fixed (fix 6/8)
- overlay.js: replaced innerHTML with textContent for category header labels; eliminates XSS surface even though tracker data is currently bundled

### Fixed (fix 7/8)
- overlay.js: replaced e.target !== host with e.composedPath().includes(host) for correct shadow DOM click-outside detection; fixed didDrag never being reset after a drag ended, which caused click-outside-to-close to stop working after any drag

### Fixed (fix 8/8)
- popup/popup.js: added chrome.runtime.lastError checks to all sendMessage callbacks; fire-and-forget sends now use a shared suppressErr callback to prevent Chrome logging unchecked runtime error warnings when the SW is mid-restart

### Fixed (audit)
- background.js: removeBlockRules now mutates domainRuleIds only after the DNR call succeeds; previously a failed updateDynamicRules would leave the rule active but the ID permanently lost from the map
- background.js: loadTrackers() failure now caught in init() so initPromise resolves instead of rejecting; extension degrades gracefully rather than breaking all message handlers
- background.js: BLOCK_TRACKER and UNBLOCK_TRACKER handlers now have .catch() - on failure, sendResponse({ ok: false }) is called and in-memory state is rolled back
- background.js: disableBlockAll() now has try/catch so blockAllEnabled state stays accurate on failure
- background.js: replaced Math.max(...Map.values()) with a for..of loop to avoid stack overflow when many trackers are individually blocked
- background.js: tabs.onUpdated now clears pushTimers on navigation to prevent stale debounced pushes firing on the new page
- background.js: GET_SITE_ENABLED, IS_SITE_DISABLED, GET_BLOCKED_TRACKERS now wait for initPromise before responding; fixes race condition where SW restart caused these to return stale empty data
- popup/popup.js: replaced innerHTML with textContent for category header labels

### Changed
- overlay.js, popup/popup.html: updated 'Block all trackers' subtitle to 'Blocks all trackers except support' to reflect actual behavior

---

## [1.0.3] - 2026-06-01

### Fixed
- background.js: removed stylesheet and font from BLOCK_RESOURCE_TYPES - trackers don't need these resource types, and blocking them caused sites to break when CDN domains (e.g. fonts.googleapis.com) appeared in the tracker list
- background.js: excluded support-category trackers from block-all and block-by-default - support tools (GitHub, Intercom, Zendesk, etc.) are often load-critical for site functionality; blocking them was causing hangs (e.g. GitHub dashboard stuck on "One moment please...")
- background.js: extracted BLOCK_ALL_EXCLUDED_CATS constant; added excludedCats to GET_BLOCK_ALL response so UI can reflect which categories are actually blocked
- overlay.js: added isEffectivelyBlocked() helper that respects excluded categories; support-category trackers no longer show as blocked/strikethrough when block-all is active; blocklist "blocked only" filter and toggle disabled state also updated
- background.js: fixed stale DNR rules causing block-all to stay active after being toggled off - root cause was atomic updateDynamicRules calls rolling back the removal when the add failed; split into separate remove/add calls so cleanup always succeeds; also restructured init() to unconditionally clear block-all rules before restoring state

---

## [1.0.2] - 2026-06-01

### Fixed
- background.js: removed blockAllEnabled from chrome.storage - it was being restored on every SW restart, making block-all re-activate on page load even without "block by default" being set; block-all is now session-only in memory, only blockAllDefault persists to storage
- background.js: init() now only calls enableBlockAll() if blockAllDefault is true; otherwise clears any leftover block-all DNR rules from the previous session (fixes "blocking by default without clicking block by default" and the cascading "can't unblock" issue caused by blockAllActive being incorrectly true)
- background.js: BLOCK_TRACKER and UNBLOCK_TRACKER handlers now await initPromise so trackerList and blockedTrackers are fully restored before acting

---

## [1.0.1] - 2026-06-01

### Fixed
- background.js: fixed race condition where GET_BLOCK_ALL and SET_BLOCK_ALL messages could arrive before init() finished loading trackers and restoring storage state; GET_BLOCK_ALL now awaits initPromise before reading blockAllEnabled/blockAllDefault, SET_BLOCK_ALL awaits initPromise before calling enableBlockAll() so trackerList is always populated
- background.js: removed duplicate init calls (onInstalled + onStartup listeners were redundant in MV3 since the SW always runs module-level code on start); replaced with single const initPromise = init()
- background.js: added try/catch in enableBlockAll around updateDynamicRules so Chrome API errors surface to the console instead of silently swallowing
- background.js: SET_BLOCK_ALL now catches enableBlockAll/disableBlockAll errors and sends ok:false response
- overlay.js: added blockAllActive state variable; enableBlockAll adds DNR rules but never populated blockedSet so nothing showed as blocked in the UI; fixed by factoring blockAllActive into all blockedSet.has() checks in renderTrackers, renderBlocklist, block button click handler, and blocklist row toggle
- overlay.js: GET_BLOCK_ALL callback now sets blockAllActive and triggers re-render; blockAllGlobal change handler also updates blockAllActive and re-renders
- overlay.js: blocklist toggles are disabled when block-all is active (individual overrides are meaningless while block-all is on)

---

## [1.0.0] - 2026-06-01

### Added
- privacy-policy.html hosted via GitHub Pages
- store-submission/ folder with zip, screenshots (1280x800), icon128.png, store-listing.txt, description.txt

### Changed
- Bumped version to 1.0.0 for Chrome Web Store submission
- Replaced all em-dashes with hyphens across all project files
- Updated store description to credit Ghostery TrackerDB

---

## [0.8.3] - 2026-06-01

### Changed
- icons: final Plankton eye layout - iris centered at icon center (64,64), sclera cx=64 cy=70 rx=26 ry=23, eyebrow raised so inner bottom barely touches sclera top (y=47); re-exported at 16/48/128px
- overlay.js: inline SVGs updated to match

---

## [0.8.2] - 2026-06-01

### Fixed
- icons: fixed Plankton eye pupil centering - sclera made more circular (rx/ry 28/26), iris centered at same point (cx=64 cy=90), highlight adjusted; re-exported at 16/48/128px
- overlay.js: updated inline SVG to match

---

## [0.8.1] - 2026-06-01

### Changed
- popup + overlay: removed inline descriptions from tracker rows - description now shows on hover only (native tooltip in popup; floating tooltip in overlay)
- popup + overlay: settings moved to gear icon in panel header top-right; bottom nav removed from popup entirely
- popup + overlay: light/dark mode toggle restored under Settings - Appearance; popup persists to popupTheme, overlay persists to overlayTheme

---

## [0.8.0] - 2026-06-01

### Changed
- popup: full redesign inspired by Bitwarden dark mode - deeper background (#15191e), bottom nav bar (This Page / Settings), tracker list grouped by category with ALL-CAPS section headers, list-row style replacing cards, full-width search bar, 360px width
- popup: settings moved into Settings tab - site toggle, block-all, block-by-default
- popup: banner status rendered as inline chip (ok/warn/none)

---

## [0.7.4] - 2026-06-01

### Added
- background.js: preemptive block-all using sequential declarativeNetRequest rule IDs from 100000+ (avoids hash collisions with individual blocks); enableBlockAll/disableBlockAll functions
- background.js: SET_BLOCK_ALL, GET_BLOCK_ALL, SET_BLOCK_ALL_DEFAULT message handlers
- background.js: consolidated startup into single async init() so block-all always waits for trackers to load before applying rules
- overlay.js: "Block all trackers" and "Block by default" toggles in settings popout; state synced from background on open; turning on default auto-enables block-all and vice versa

---

## [0.7.3] - 2026-06-01

### Changed
- background.js: first tracker detected on a page now pushes to the overlay immediately instead of waiting for the 400ms debounce; subsequent trackers still debounce to batch updates

---

## [0.7.2] - 2026-06-01

### Added
- data/trackers.json: generated plain-English privacy-focused descriptions for all 3435 trackers; descriptions say what each tracker collects or does to the user (not corporate blurbs)
- scripts/generate-descriptions.js: generation script retained for future re-runs if tracker list is updated

---

## [0.7.1] - 2026-06-01

### Fixed
- scripts/build-trackers.js: fixed CATEGORY_MAP - 'advertising' was incorrectly mapped to 'ads' instead of 'advertising', causing 1706 ad trackers to render without CSS styling or label in the popup and overlay

---

## [0.7.0] - 2026-06-01

### Changed
- data/trackers.json: replaced hand-curated 241-tracker list with Ghostery Tracker Database (ghostery/trackerdb, CC-BY-NC-SA-4.0); now 3435 trackers across 5059 domains
- scripts/build-trackers.js: new build script - fetches latest @ghostery/trackerdb from npm and converts to TrackerTracker format; run with `node scripts/build-trackers.js` to update
- background.js: matchTracker() rewritten from O(n) linear scan to O(hostname_depth) suffix-based Map lookups; required for correctness at scale

---

## [0.6.3] - 2026-05-29

### Changed
- background.js: toolbar badge now uses yellow background (`#f2e840`) with dark text (`#1a1a1a`) via `setBadgeTextColor` - matches icon palette
- overlay.js: pill badge text changed to white-ish (`#e8f0ff`) in dark mode; dark (`#111827`) in light mode - fixes yellow-on-white readability

---

## [0.6.2] - 2026-05-29

### Fixed
- Block-all toggle replaced with a plain native checkbox - the custom toggle track was rendering alongside the checkbox but not responding to state changes
- Native checkbox uses `accent-color: #f2e840` to stay on-palette

### Changed
- Pill badge redesigned - removed red pill background, now shows plain number only

---

## [0.6.1] - 2026-05-29

### Changed
- Accent color swapped from blue (`#3b82f6`) to Plankton eye yellow (`#f2e840`) across all UI - ties the palette directly to the icon
- Darker accent variant updated to `#c8ba00` for light mode
- `popup.css` `--accent` and `--warn` variables updated to match

---

## [0.6.0] - 2026-05-29

### Changed
- **Icon:** replaced cookie-with-knife with a flat minimal Plankton eye - sage green background (`#5e8c6a`), wing eyebrow touching the sclera, large yellow oval, small red iris, white catchlight. Exported at 16/48/128px.
- **Palette:** full swap from zinc/amber to navy/blue - background `#0d1117`, surface `#111827`, border `#1e2d42`, text `#e8f0ff`, muted `#8b9abf`
- Inline SVG in pill and panel header updated to match new icon

---

## [0.5.5] - 2026-05-29

### Changed
- **Renamed:** Cookiecutter to TrackerTracker across `manifest.json`, `popup.html`, `popup.js`, `overlay.js`, `background.js`
- Host element id updated to `trackertracker-host`
- Extension description updated; action title updated

---

## [0.5.4] - 2026-05-29

### Fixed
- Settings popout closing on every inner click - root cause was `e.composedPath()` being pruned by closed shadow DOM for document-level listeners
- Replaced with two-listener strategy: document listener checks `e.target !== host` (truly outside clicks), shadow root listener uses unpruned `composedPath()` to close settings on clicks inside shadow but outside the popout

### Added
- "Blocked only" checkbox in tracker blocklist, checked by default - shows only blocked trackers; unchecking reveals all 241
- Search filter applies on top of the blocked-only filter
- Toggling a tracker re-renders the list respecting current filter state

---

## [0.5.3] - 2026-05-29

### Fixed
- Settings popout closing on any click inside it - root cause was outside-click handler using e.target/.contains() which shadow DOM retargets to the host element, making every inner click look like an outside click; replaced with e.composedPath() which pierces shadow boundaries and returns the real event path

---

## [0.5.2] - 2026-05-29

### Added
- **Tracker blocklist in settings** - full list of all 241 known trackers, alphabetically sorted, each with a category badge and block toggle
- Filter search box (filters by name or category)
- Live "N blocked" count badge in section header
- Lazily fetched and cached on first settings open
- Toggling a tracker in the list updates `blockedSet` and re-renders the page tracker list if open
- Settings popout widened to 270px to accommodate the list
- `GET_ALL_TRACKERS` message handler added to background service worker

---

## [0.5.1] - 2026-05-29

### Added
- "Block all" checkbox in the tracker count row - blocks/unblocks all currently detected trackers in parallel
- Checked state reflects whether all detected trackers are blocked; stays in sync with per-tracker toggles
- Hidden when no trackers are detected

---

## [0.5.0] - 2026-05-29

### Added
- **Per-tracker blocking** via `chrome.declarativeNetRequest.updateDynamicRules`
- `declarativeNetRequest` permission added to manifest
- `domainToRuleId()` derives stable integer rule IDs from domain strings (range 10000-59999)
- Rules restored on service worker startup
- New message handlers: `BLOCK_TRACKER`, `UNBLOCK_TRACKER`, `GET_BLOCKED_TRACKERS`
- Each tracker row shows a block button (hidden until hover, turns red when active)
- Blocked rows show name strikethrough and faded logo/badge

---

## [0.4.7] - 2026-05-29

### Fixed
- Reverted OS `prefers-color-scheme` detection for default theme - Chrome set to "Use device default" inherits device light mode, overriding the intended dark default. Dark is now the unconditional default when no `overlayTheme` is saved.

---

## [0.4.6] - 2026-05-29

### Added
- Theme now defaults to OS `prefers-color-scheme` on first load (later reverted in 0.4.7)

---

## [0.4.5] - 2026-05-29

### Added
- **Light/dark mode toggle** in settings popout
- `applyTheme(light)` toggles `cc-light` class on shadow host
- Light/dark CSS overrides covering all elements - pill, panel, badges, category tags, tooltip, settings popout
- Preference persisted to `chrome.storage.local` as `overlayTheme`

---

## [0.4.4] - 2026-05-29

### Fixed
- Gear button was closing the panel instead of opening settings - root cause was the panel header `mousedown` drag handler calling `e.preventDefault()`, swallowing the gear button's `click` event
- Fixed by adding a guard at the top of `startDrag` to bail when target is a button/input/label/a

---

## [0.4.3] - 2026-05-29

### Changed
- Settings redesigned from in-panel view (which hid the tracker list) to a separate `position: fixed` floating popout at shadow root level, positioned to the left of the panel
- Settings and tracker list now visible simultaneously
- Speech-bubble arrow tail points right toward the panel

---

## [0.4.2] - 2026-05-29

### Added
- Settings button (gear icon) in panel header
- Settings view with per-site enable/disable toggle and reset position button

---

## [0.4.1] - 2026-05-29

### Added
- Drag-and-drop repositioning for the pill and panel
- 4px movement threshold distinguishes drag from click
- Position persisted to `chrome.storage.local` as `overlayPos`; clamped to viewport on restore

### Fixed
- Tooltip not appearing - `:hover` CSS tooltip was clipped by `overflow-y: auto` on `.cc-list`; replaced with a single shared `position: fixed` tooltip div at shadow root level

---

## [0.4.0] - 2026-05-29

### Added
- Expanded tracker database from 154 to 241 trackers - added coverage of ad exchanges, affiliate networks, attribution tools, session recording, product analytics, marketing platforms, support tools, social embeds, survey tools, error monitoring, and B2B data providers

---

## [0.3.3] - 2026-05-29

### Changed
- overlay.js: tooltip restyled as speech bubble with border-colored tail and fill-colored tail overlay; slightly larger padding, rounder corners, lighter text

---

## [0.3.2] - 2026-05-29

### Fixed
- Tooltip not appearing - `overflow-y: auto` on `.cc-list` was clipping absolutely-positioned children; replaced CSS `:hover` tooltip with a single shared `position: fixed` tooltip appended to shadow root, shown/hidden via JS mouseenter/mouseleave

---

## [0.3.1] - 2026-05-29

### Changed
- Tracker list now shows logo + name only; description moved to CSS tooltip that appears on hover

---

## [0.3.0] - 2026-05-29

### Changed
- Pill moved from bottom-right to top-right (top: 20px); panel now drops down below pill

### Added
- Expanded tracker database from 120 to 157 trackers - added Teads, Unruly, Tremor Video, TripleLift, Sharethrough, Nativo, Connatix, Innovid, Yahoo/Oath DSP, Quora Pixel, Wistia, Vidyard, JW Player, Brightcove, Leadfeeder/Dealfront, Albacross, Clearbit Reveal, Demandbase, 6sense, Adobe Analytics/Omniture, Adobe Audience Manager, Neustar/TransUnion, Acxiom, Perfect Audience, Salesloft, Outreach.io, Samba TV, GoSquared, etracker, Histats, Yieldmo, Smart AdServer/Equativ, Extreme Reach, Pubstack, Seedtag, Fathom Analytics, Simple Analytics, Plausible

---

## [0.2.0] - 2026-05-29

### Added
- **Floating page overlay** - pill button fixed top-right, expands to tracker panel on click; Shadow DOM for complete style isolation
- Real-time push updates from background via `TRACKER_UPDATE` and `BANNER_STATUS_UPDATE` messages
- `schedulePush` debounce (400ms) in background to batch tracker updates
- `GET_MY_TAB_DATA` handler for overlay initial state load
- Expanded tracker database to 120 trackers

---

## [0.1.0] - 2026-05-29

### Added
- Initial Chrome MV3 extension scaffold
- `background.js` service worker - `webRequest.onBeforeRequest` tracker detection, per-tab badge, `disabledSites` persistence
- `content.js` - auto-declines cookie banners for 10 platforms: OneTrust, Cookiebot, TrustArc, Osano, Termly, Didomi, Quantcast, Usercentrics, Consentmanager, CookieYes; generic fuzzy text scoring fallback; MutationObserver with 30s timeout
- `popup/` - dark-theme action popup with tracker cards, banner status, per-site toggle
- `data/trackers.json` - initial tracker database (50 entries)
- Icons: cookie-with-knife SVG at 16/48/128px
