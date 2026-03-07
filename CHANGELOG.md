# Changelog

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
