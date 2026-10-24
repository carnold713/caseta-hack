#!/usr/bin/env bash
# Put one built file on the screensync-latest release, making the release the first time. The Windows and Mac builds
# run side by side, so either may find the other has just made it.
set -euo pipefail
file="$1"
notes="Built from ${GITHUB_SHA::7} on ${GITHUB_REF_NAME}. Windows: download CasetaScreenSync.exe and run it. Mac (Apple silicon or Intel, macOS 13 or later): download CasetaScreenSync-mac.zip, open it, move CasetaScreenSync to Applications and open it. Then, in the app, open the room and switch on PC screen."
if ! gh release view screensync-latest >/dev/null 2>&1; then
  gh release create screensync-latest --title "Caseta screen sync for Windows and Mac (latest)" --notes "$notes" --prerelease --target "$GITHUB_SHA" || true
fi
gh release upload screensync-latest "$file" --clobber
gh release edit screensync-latest --title "Caseta screen sync for Windows and Mac (latest)" --notes "$notes" --prerelease
