# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Extension Pack Hub is a Chrome extension and static website that allows users to create, share, and install bundles of browser extensions via URL-encoded packs (similar to modpacks for Minecraft). Everything is encoded in the URL hash—no backend required.

## Development Setup

```bash
# Load extension in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select the extension/ folder

# Run website locally
cd docs && python -m http.server 8000
```

## Architecture

### Chrome Extension (`extension/`)
- **Manifest V3** extension with service worker architecture
- `background.js` - Service worker handling extension management events, downloads, and message passing between popup and content
- `popup/` - Main UI for creating packs and viewing installed extensions
- `install-wizard/` - Multi-step wizard for installing GitHub-hosted extensions (download, extract, load unpacked)
- `lib/pack-codec.js` - URL encoding/decoding using base64. Packs are JSON objects encoded in URL hash
- `lib/github-api.js` - GitHub API client for fetching releases and analyzing extension permissions

### Static Website (`docs/`)
- GitHub Pages site that serves as pack viewer and landing page
- `app.js` duplicates PackCodec for standalone use (website works without extension)
- Decodes pack from URL hash and renders extension list with install links

### Pack Format (v2)
```json
{
  "v": 2,
  "name": "Pack Name",
  "extensions": [
    { "type": "store", "id": "chrome-extension-id", "name": "Name" },
    { "type": "github", "repo": "owner/repo", "name": "Name", "releaseTag": "v1.0.0" }
  ]
}
```

## Key Patterns

- Extension types: `store` (Chrome Web Store) or `github` (GitHub releases)
- Pack URLs: `https://ifaka.github.io/extension-pack-hub/#<base64-encoded-json>`
- GitHub extensions show permission warnings by fetching manifest.json from the repo
- The popup uses Chrome's `management` API to list installed extensions and detect store vs local installs

## Workflow

- Always commit changes after finishing a task
