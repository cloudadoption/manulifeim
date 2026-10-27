#!/bin/sh
# Rebuilds the stand-in query index from the previewed pages and uploads + previews it as the
# DA sheet /institutional/tw/en/preview-index.json (never published). See build-preview-index.mjs.
set -e
node tools/importer/build-preview-index.mjs
curl -s -o /dev/null -w "preview-index upload %{http_code}\n" -X POST \
  -F "data=@tools/importer/reports/preview-index.json;type=application/json" \
  https://admin.da.live/source/cloudadoption/manulifeim/institutional/tw/en/preview-index.json
curl -s -o /dev/null -w "preview-index preview %{http_code}\n" -X POST \
  https://admin.hlx.page/preview/cloudadoption/manulifeim/main/institutional/tw/en/preview-index.json
