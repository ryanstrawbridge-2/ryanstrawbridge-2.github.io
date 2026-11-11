#!/usr/bin/env bash
# Render a deck's slides to PNG through Keynote, for checking layout.
#   ./render.sh lifting-frame   -> /tmp/.../render/lifting-frame/*.png
set -euo pipefail
slug="$1"
here="$(cd "$(dirname "$0")" && pwd)"
out="${RENDER_DIR:-$here/.render}/$slug"
rm -rf "$out"; mkdir -p "$out"
osascript <<OSA
tell application "Keynote"
  set d to open POSIX file "$here/$slug.pptx"
  delay 1
  export d to POSIX file "$out" as slide images with properties {image format:PNG, skipped slides:false}
  close d saving no
end tell
OSA
find "$out" -name '*.png' | sort
