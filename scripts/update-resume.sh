#!/usr/bin/env bash
# Update the résumé on the site from an Overleaf export.
#
#   npm run resume                      # newest Overleaf .zip or .pdf in ~/Downloads
#   npm run resume -- ~/path/thing.zip  # a specific file
#   npm run resume:build                # compile resume/*.tex as it stands
#
# Give it the SOURCE zip (Overleaf: Menu -> Download -> Source) and it keeps
# resume/*.tex and the published PDF in lockstep — the .tex is extracted and
# compiled here, so the two can't drift. Give it a PDF and it just installs
# that, leaving the repo's .tex untouched and therefore possibly stale.
#
# Does not push. Run `npm run publish` after, so you can look at the PDF first.

set -euo pipefail
cd "$(dirname "$0")/.."

PUBLIC_PDF="public/RyanStrawbridgeResume.pdf"
TEX_DIR="resume"
TECTONIC="${TECTONIC:-$HOME/.local/bin/tectonic}"

SRC="${1:-}"

# Editing resume/ryan-strawbridge-resume.tex directly? Compile that, no import.
if [ "$SRC" = "--local" ] || [ "$SRC" = "local" ]; then
  [ -x "$TECTONIC" ] || { echo "tectonic not at $TECTONIC"; exit 1; }
  echo "→ compiling $TEX_DIR/ryan-strawbridge-resume.tex"
  ( cd "$TEX_DIR" && "$TECTONIC" ryan-strawbridge-resume.tex >/dev/null )
  cp "$TEX_DIR/ryan-strawbridge-resume.pdf" "$PUBLIC_PDF"
  echo "→ installed $PUBLIC_PDF"
  SIZE=$(( $(wc -c < "$PUBLIC_PDF") / 1024 ))
  echo
  echo "✓ ${SIZE} KB. Check it, then publish:"
  echo "    open $PUBLIC_PDF"
  echo "    npm run publish -- \"Update resume\""
  exit 0
fi

if [ -z "$SRC" ]; then
  # Newest Overleaf-looking export in Downloads.
  SRC=$(ls -t "$HOME"/Downloads/*.zip "$HOME"/Downloads/*.pdf 2>/dev/null | head -1 || true)
  [ -n "$SRC" ] || { echo "No .zip or .pdf found in ~/Downloads. Pass a path: npm run resume -- <file>"; exit 1; }
  echo "Using newest download: $SRC"
fi
[ -f "$SRC" ] || { echo "Not a file: $SRC"; exit 1; }

case "$SRC" in
  *.zip)
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    unzip -q "$SRC" -d "$TMP"
    TEX=$(find "$TMP" -name '*.tex' -maxdepth 3 | head -1)
    [ -n "$TEX" ] || { echo "No .tex inside $SRC"; exit 1; }
    echo "→ found $(basename "$TEX")"

    cp "$TEX" "$TEX_DIR/ryan-strawbridge-resume.tex"
    echo "→ updated $TEX_DIR/ryan-strawbridge-resume.tex"

    [ -x "$TECTONIC" ] || { echo "tectonic not at $TECTONIC — install it or pass the exported PDF instead"; exit 1; }
    echo "→ compiling"
    ( cd "$TEX_DIR" && "$TECTONIC" ryan-strawbridge-resume.tex >/dev/null )
    cp "$TEX_DIR/ryan-strawbridge-resume.pdf" "$PUBLIC_PDF"
    echo "→ compiled and installed $PUBLIC_PDF"
    ;;
  *.pdf)
    cp "$SRC" "$PUBLIC_PDF"
    echo "→ installed $PUBLIC_PDF"
    echo "⚠️  PDF only — resume/*.tex is unchanged and may no longer match."
    echo "   Use Overleaf's Menu -> Download -> Source (.zip) to keep them together."
    ;;
  *) echo "Expected a .zip (Overleaf source) or a .pdf. Got: $SRC"; exit 1 ;;
esac

SIZE=$(( $(wc -c < "$PUBLIC_PDF") / 1024 ))
echo
echo "✓ ${SIZE} KB. Open it, then publish:"
echo "    open $PUBLIC_PDF"
echo "    npm run publish -- \"Update resume\""
