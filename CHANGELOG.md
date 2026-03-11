# Changelog

## [v0.1.16] - 2026-03-11

- fix: scroll jitter after streaming ends caused by content-visibility height mismatch (765052a)
- fix: stop auto-scroll jitter when user scrolls slightly during streaming (171a62e)

## [v0.1.15] - 2026-03-10

- fix: default revertSteps to 0 in FloatingActions (400fbb4)
- chore: bump version to 0.1.15 (3f57df2)
- fix: slow scroll during streaming causes jitter by pulling user back to bottom (860683e)
- fix: isFocused stuck after toolbar button click prevents capsule collapse (aaaa727)
- refactor: extract FloatingActions and CollapsedCapsule components from InputBox (273bd98)
- refactor: extract useInputHistory hook from InputBox (d920da9)
- refactor: extract useAttachmentRail hook from InputBox (2150d82)
- refactor: extract useMobileCollapse hook from InputBox (c5fd39b)
- fix: mobile input capsule state not resetting on session switch + blur collapsing on toolbar interaction (474938e)

## [v0.1.14] - 2026-03-10

- fix: session switch scroll + eliminate all content flicker during load (d823799)
- fix: infinite history loading loop + stabilize observer + cleaner scroll-to-bottom (fe28777)
- fix: smooth shimmer gradient + disable browser scroll restoration + multi-frame scroll-to-bottom (2144260)
- fix: shimmer highlight sweep + remove unused visibleMessageIds state (ae767ca)
- fix: outline click retract, prepend scroll preservation, cross-message merge continuation (e3ca11a)
- fix: desktop label click navigation + mobile passive touch events in OutlineIndex (f35f758)
- refactor: rewrite OutlineIndex with clean fisheye engine (1057c1c)
- refactor: replace react-virtuoso with native scroll + content-visibility (2dc550a)
- fix: correct shimmer animation direction (left-to-right) and use linear timing (16bc419)
- fix: endsWithTool skips empty reasoning/text so cross-message tool merging works correctly (fdedbcd)
- style: replace thinking breath-bar with shimmer text animation in italic mode (1bed06b)

## [v0.1.13] - 2026-03-10

- fix: SSE reconnect race conditions and stale timeout constant (7614d53)
- test: add unit tests for HTTP module and Tauri environment detection (79b77af)
- chore: eliminate all 8 lint warnings (0 errors, 0 warnings) (b312bb6)
- fix: URL-encode query string values in buildQueryString (f6a434e)
- fix: add AbortController-based timeout to HTTP request() (7962278)
- fix: pending permission/question cache supports multiple requests per session (b421172)
- fix: SSE parser now handles CRLF line endings and multi-line data correctly (d4553d5)
- chore: remove dead storage key exports (WIDE_MODE, THEME_MODE, SIDEBAR_WIDTH, MODEL_VARIANT_PREFIX) (2901c99)
- refactor: replace bare console.error with unified error handlers across 14 files (7a0c86c)
- refactor: move theme/wideMode into themeStore, eliminate prop drilling through Sidebar and SettingsDialog (9c8b2d7)
- refactor: split messageStore into store, types, and React hooks layers (caef036)
- refactor: extract App.tsx hooks (useViewportHeight, useCancelHint, useCloseServiceDialog) (2dd70e3)
- refactor: split SidePanel into focused sidebar components (673db54)
- refactor: extract InputBox utility functions to input/inputUtils.ts (a1c0eee)
- refactor: split SettingsDialog into focused component files (72f5ed4)
- refactor: consolidate duplicated formatting functions into utils/formatUtils.ts (a981c89)
- refactor: deduplicate diff content extraction (fad37d4)
- refactor: extract ModalShell to unify modal overlay infrastructure (ae9f96e)
- chore: remove unnecessary eslint-disable in logger.ts (118740c)
- chore: clean up dependencies (0c50ac0)
- refactor: add dev-only logger, replace bare console.log with logger.log (91fc303)
- refactor: remove dead code files (test-shiki.ts, editorUtils.ts, toolUtils.ts) (3a3f37a)

## [v0.1.12] - 2026-03-09

- fix: preserve changelog ordering during release prep (039b906)
- chore: ignore generated tauri assets in lint (071e2db)
- fix: keep slash command composer responsive (42cdcf6)
- fix: restore cross-platform Tauri app handling (6b84717)
- perf: replace std default hasher with rapidhash (c6d5bdb)
- refactor: reorganize the file structure of Tauri backend (fa5edf6)
- perf: refactor OpenDirectoryState with papaya HashMap to reduce lock contention (6efd2a0)
- perf: optimize ServiceState.child_pid with AtomicU32 to reduce Mutex contention (a42df0b)
- perf: optimize SseState implementation - replace Mutex+Hashmap with papaya library to reduce contention and improve performance (f586a84)

## [v0.1.11] - 2026-03-08

- feat: add an optional folder-style Recent view while preserving the original session row details and per-folder ordering controls
- feat: aggregate Active sessions across all saved projects instead of limiting the list to the currently selected directory

## [v0.1.10] - 2026-03-08

- fix: harden session message sync and failed sends (b788dce)
- chore: add validated release preparation flow (010ffbe)
- docs: consolidate v0.1.9 release notes (79113da)

## [v0.1.9] - 2026-03-08

- fix: restore message attachment expand animation (2975fe3)
- fix: streamline composer attachment rail interactions (99db58a)
- fix: constrain expanded attachments and preserve composer blank lines (dd2d7ba)
- fix: harden composer attachment rail scrolling (b2bac29)

## [v0.1.7] - 2026-03-08

- fix: truncate tool description overflow in tool call row (3782c67)
- fix: tighten mobile model menu and attachment width (60b34a2)
- fix: preserve utf-8 across tauri stream chunks (1dcb15a)

## [v0.1.6] - 2026-03-07

- fix: restore tauri mobile file attachments (ffe3398)

## [v0.1.5] - 2026-03-07

- chore: keep tauri config formatted on release (48f6045)
- fix: sync settings version with app release (b815d18)
- chore: format release workflow (aef533b)
- ci: add build validation workflow (491a544)
- other: add "zed/\*" as ignored file (8f32b7d)

## [v0.1.4] - 2026-03-07

- fix: split frontend and api slash commands (bdb2e33)
- fix: support clipboard fallback in insecure contexts (edf4dd0)
- fix: align slash command descriptions (9d84a78)

## [v0.1.3] - 2026-03-07

- chore: restore release workflow formatting (73a41a4)
- perf: split code preview from file explorer (b94bfc5)
- perf: lazy load optional panels and split vendor chunks (9e0f7d6)
- chore: add test baseline and clean lint debt (0d5f175)
- chore: establish lint and formatting baseline (762786d)
- fix: shorten input footer disclaimer copy (d691b7b)
- chore: automate lockfile updates in release script (e678349)

## [v0.1.2] - 2026-03-07

- fix: scope active session state to the current directory (2503c6b)

## [v0.1.1] - 2026-03-07

Patch release focused on chat input polish, session list consistency, and smoother permission handling.

### Fixes

- Restored collapsed input dock bottom spacing
- Kept the session list in sync across directory filters and live updates
- Returned gracefully to a new chat after deleting the currently open session
- Aligned the todo popover with the input dock for desktop and mobile
- Removed extra polling from permission/question flows and synced reply state immediately

### Improvements

- Preloaded `@` root listing and `/` command data when entering a session to reduce first-open lag

## [v0.1.0] - 2026-03-05

First stable release of OpenCodeUI.

### Features

- Drag-and-drop file attachment support (desktop & mobile)
- Material file icons for file/folder display
- File @mention from explorer sidebar
- Context breakdown visualization in sidebar
- Live retry status display with expand/collapse
- Attachment detail viewer with copy/save functionality
- Capability-based file attachment upload

### Fixes

- Aligned capsule thinking chevron with italic/tool toggle arrows
- Stabilized Tauri desktop file drag-and-drop handling
- Fixed multiple task windows rendering the latest child session
- Eliminated scroll jank from high-frequency re-renders
- Fixed mobile overflow in project and diff headers
- Fixed sidebar notification/session meta row overflow
- Fixed attachment pill truncation and compact tool layout

### Improvements

- Migrated all icons to lucide-react
- Unified message part spacing and alignment
- Added Docker support with material icons build step
