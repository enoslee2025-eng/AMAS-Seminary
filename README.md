# AMAS Seminary

This repository now serves as the recovery workspace for the AMAS Seminary project.

## What is currently preserved

- A local Git history baseline
- The recovered frontend snapshot from the iOS simulator bundle
- Recovery notes and reconstruction guidance

## Current runnable app snapshot

Recovered app files live here:

- `recovered_from_simulator/public/index.html`
- `recovered_from_simulator/public/assets/index-DLMqdEsW.js`

## Commands

- `npm run dev`
  - Runs the new editable Vite source workspace on `http://127.0.0.1:4174`
- `npm run dev:recovered`
  - Serves the recovered frontend snapshot on `http://127.0.0.1:4173`
- `npm run sync:simulator`
  - Refreshes the recovered snapshot from the simulator app install into both recovery folders

## Recovery direction

The original editable React/TypeScript source is gone. The next development phase is:

1. Keep the recovered bundle versioned
2. Recreate a fresh editable source workspace
3. Rebuild modules incrementally: app shell, courses, community, chat, profile, backend
