---
name: flowweb-browser
description: Browser automation via flowweb daemon. Navigate pages, capture snapshots, extract content, and interact with web applications through Playwright Chromium.
---

# Flowweb Browser Automation

## Commands

The flowweb daemon exposes browser control via IPC. These commands are available through the TUI or as agent tools:

| Command | Purpose |
|---------|---------|
| `open <url>` | Navigate browser to a URL (auto-adds https:// if missing) |
| `snapshot` | Capture page accessibility tree as structured JSON |
| `pages` | List all open pages/tabs with active indicator |
| `close` | Close the current browser session |
| `session list` | List all saved sessions |
| `session new <name>` | Create a new named session |
| `session delete <name>` | Delete a session |

## Working Rules

1. Prefer page evaluation (`page.evaluate`) for data extraction over DOM manipulation
2. Use accessibility tree snapshots for understanding page structure
3. Always verify navigation succeeded before proceeding with interactions
4. Close sessions when done to free resources
5. Headless mode is available for automated workflows

## Page State

Each page tracks:
- URL, title, active status
- Creation timestamp
- CDP endpoint for direct Chrome DevTools Protocol access

## Session Persistence

Sessions are saved to `.flowweb/sessions/<name>/` with:
- `session-state.json` — current browser state
- `actions.jsonl` — action log for replay/audit
