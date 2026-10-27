#!/bin/sh
# After one or more capture batches (snap-*.json in /tmp/playwright): store them, map images,
# import the new pages from the snapshots, point images at the local copies, upload and preview
# everything that passes the guard. The MCP browser must be closed first (the importer starts
# its own Chromium). Usage: sh tools/importer/after-capture.sh [upload-limit]
set -e
for f in /tmp/playwright/snap-*.json; do
  [ -f "$f" ] && node tools/importer/snapshot/ingest.mjs "$f" | tail -3
done
node tools/importer/snapshot/rescan-images.mjs
node tools/importer/snapshot/images.mjs sidecars
node tools/importer/snapshot/fix-media.mjs | tail -1
node tools/importer/run-captured.mjs --limit 60 | grep -E '^==|Completed|imported' || true
node tools/importer/snapshot/fix-media.mjs | tail -1
node tools/importer/localize-images.mjs | tail -1
node tools/importer/check-images.mjs | tail -2
node tools/importer/upload-pending.mjs --limit "${1:-80}" | tail -4
sh tools/importer/update-preview-index.sh | tail -3
