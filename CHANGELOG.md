# TrackerTracker Changelog

All notable changes to this project are documented here.

---

## [0.6.3] — 2026-05-29

### Changed
- Toolbar badge now uses yellow background (`#f2e840`) with dark text (`#1a1a1a`) via `setBadgeTextColor` — matches icon palette, replaces red
- Pill badge text changed to white-ish (`#e8f0ff`) in dark mode; dark (`#111827`) in light mode — fixes yellow-on-white readability

---

## [0.6.2] — 2026-05-29

### Fixed
- Block-all toggle replaced with a plain native checkbox — the custom toggle track was rendering alongside the checkbox but not responding to state changes
- Native checkbox uses `accent-color: #f2e840` to stay on-palette

### Changed
- Pill badge redesigned — removed red pill background, now shows plain number only

---

## [0.6.1] — 2026-05-29

### Changed
- Accent color swapped from blue (`#3b82f6`) to Plankton eye yellow (`#f2e840`) across all UI — ties the palette directly to the icon
- Darker accent variant updated to `#c8ba00` for light mode
- `popup.css` `--accent` and `--warn` variables updated to match

---

## [0.6.0] — 2026-05-29

### Changed
- **Icon:** replaced cookie-with-knife with a flat minimal Plankton eye — sage green background (`#5e8c6a`), wing eyebrow touching the sclera, large yellow oval, small red iris, white catchlight. Exported at 16/48/128px.
- **Palette:** full swap from zinc/amber to navy/blue — background `#0d1117`, surface `#111827`, border `#1e2d42`, text `#e8f0ff`, muted `#8b9abf`
- Inline SVG in pill and panel header updated to match new icon

---

## [0.5.5] — 2026-05-29

### Changed
- **Renamed:** Cookiecutter → TrackerTracker across `manifest.json`, `popup.html`, `popup.js`, `overlay.js`, `background.js`
- Host element id updated to `trackertracker-host`
- Extension description updated; action title updated
- Footer GitHub link updated

---

## [0.5.4] — 2026-05-29

### Fixed
- Settings popout closing on every inner click — root cause was `e.composedPath()` being pruned by closed shadow DOM for document-level listeners
- Replaced with two-listener strategy: document listener checks `e.target !== host` (truly outside clicks), shadow root listener uses unpruned `composedPath()` to close settings on clicks inside shadow but outside the popout

### Added
- "Blocked only" checkbox in tracker blocklist, checked by default — shows only blocked trackers; unchecking reveals all 241
- Search filter applies on top of the blocked-only filter
- Toggling a tracker re-renders the list respecting current filter state

---

## [0.5.3] — 2026-05-29

### Fixed
- Previous attempt at shadow DOM click handling used `composedPath()` from document level, which closed shadow DOM prunes — reverted to correct approach

---

## [0.5.2] — 2026-05-29

### Added
- **Tracker blocklist in settings** — full list of all 241 known trackers, alphabetically sorted, each with a category badge and block toggle
- Filter search box (filters by name or category)
- Live "N blocked" count badge in section header
- Lazily fetched and cached on first settings open
- Toggling a tracker in the list updates `blockedSet` and re-renders the page tracker list if open
- Settings popout widened to 270px to accommodate the list
- `GET_ALL_TRACKERS` message handler added to background service worker

---

## [0.5.1] — 2026-05-29

### Added
- "Block all" checkbox in the tracker count row — blocks/unblocks all currently detected trackers in parallel
- Checked state reflects whether all detected trackers are blocked; stays in sync with per-tracker toggles
- Hidden when no trackers are detected

---

## [0.5.0] — 2026-05-29

### Added
- **Per-tracker blocking** via `chrome.declarativeNetRequest.updateDynamicRules`
- `declarativeNetRequest` permission added to manifest
- `domainToRuleId()` derives stable integer rule IDs from domain strings (range 10000–59999) — avoids persisting a rule ID map
- Rules block: script, XHR, image, stylesheet, font, media, websocket, ping, sub_frame, other
- Blocked tracker names + domains persisted to `chrome.storage.local`; rules restored on service worker startup
- New message handlers: `BLOCK_TRACKER`, `UNBLOCK_TRACKER`, `GET_BLOCKED_TRACKERS`
- Each tracker row shows a `⊘` block button (hidden until hover, turns red when active)
- Blocked rows show name strikethrough and faded logo/badge

---

## [0.4.7] — 2026-05-29

### Fixed
- Reverted OS `prefers-color-scheme` detection for default theme — Chrome set to "Use device default" inherits device light mode, overriding the intended dark default. Dark is now the unconditional default when no `overlayTheme` is saved.

---

## [0.4.6] — 2026-05-29

### Added
- Theme now defaults to OS `prefers-color-scheme` on first load (later reverted in 0.4.7)

---

## [0.4.5] — 2026-05-29

### Added
- **Light/dark mode toggle** in settings popout
- `applyTheme(light)` toggles `cc-light` class on shadow host
- ~60 `:host(.cc-light)` CSS override rules covering all elements — pill, panel, badges, category tags, tooltip, settings popout
- Light mode uses `#d97706` darker amber accent for contrast on white
- Preference persisted to `chrome.storage.local` as `overlayTheme`

---

## [0.4.4] — 2026-05-29

### Fixed
- Gear button was closing the panel instead of opening settings — root cause was the panel header `mousedown` drag handler calling `e.preventDefault()`, swallowing the gear button's `click` event
- Fixed by adding `if (e.target.closest("button, input, label, a, select")) return;` guard at the top of `startDrag`

---

## [0.4.3] — 2026-05-29

### Changed
- Settings redesigned from in-panel view (which hid the tracker list) to a separate `position: fixed` floating popout at shadow root level, positioned to the left of the panel
- Settings and tracker list now visible simultaneously
- Speech-bubble arrow tail points right toward the panel

---

## [0.4.2] — 2026-05-29

### Added
- Settings button (⚙) in panel header
- Settings view with per-site enable/disable toggle and reset position button

---

## [0.4.1] — 2026-05-29

### Fixed
- Tooltip not appearing — `:hover` CSS tooltip was clipped by `overflow-y: auto` on `.cc-list`
- Fixed by creating a single shared `position: fixed` tooltip div at shadow root level, positioned dynamically via `getBoundingClientRect()` on `mouseenter`

---

## [0.4.0] — 2026-05-29

### Added
- Drag-and-drop repositioning for the pill and panel
- 4px movement threshold distinguishes drag from click
- `startDrag` guards against hijacking clicks on buttons/inputs/labels
- Position persisted to `chrome.storage.local` as `overlayPos`; clamped to viewport on restore

---

## [0.3.0] — 2026-05-29

### Added
- **Floating page overlay** — pill button fixed top-right, expands to tracker panel on click
- Shadow DOM (`mode: "closed"`) for complete style isolation
- Pill: cookie icon + badge count
- Panel: tracker list with logo, name, category badge, description tooltip
- Banner status row (found / declined / not found)
- Real-time push updates from background via `TRACKER_UPDATE` and `BANNER_STATUS_UPDATE` messages
- `schedulePush` debounce (400ms) in background to batch tracker updates

---

## [0.2.0] — 2026-05-29

### Added
- Expanded tracker database to **241 trackers** across advertising, analytics, social, marketing, support, performance, affiliate, attribution categories
- Each tracker has: name, company, domains, category, plain-English description, logo URL

---

## [0.1.0] — 2026-05-29

### Added
- Initial Chrome MV3 extension scaffold
- `background.js` service worker — `webRequest.onBeforeRequest` tracker detection, per-tab badge, `disabledSites` persistence
- `content.js` — auto-declines cookie banners for 10 platforms: OneTrust, Cookiebot, TrustArc, Osano, Termly, Didomi, Quantcast, Usercentrics, Consentmanager, CookieYes; generic fuzzy text scoring fallback; MutationObserver with 30s timeout
- `popup/` — dark-theme action popup with tracker cards, banner status, per-site toggle
- `data/trackers.json` — initial tracker database (50 entries)
- Icons: cookie-with-knife SVG at 16/48/128px
