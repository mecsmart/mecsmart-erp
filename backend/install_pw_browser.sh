#!/usr/bin/env bash
# Idempotent Playwright Chromium installer.
# Run this once on production to pre-warm the PDF endpoint
# (otherwise the first /api/print/html-to-pdf call will auto-install,
# adding ~30s latency to that first request).
set -e
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/pw-browsers}
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
playwright install chromium
echo "[OK] Chromium installed at $PLAYWRIGHT_BROWSERS_PATH"
