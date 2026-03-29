#!/usr/bin/env bash
# Creates a server-mode DMG from a Tauri-built .app bundle.
#
# The generated .app uses a thin shell launcher as CFBundleExecutable so that
# double-clicking it starts the real binary with "--mode server", while the
# bare binary (used by CLI plugins) is left untouched.
#
# Usage:
#   make-server-dmg.sh <source.app> <output.dmg> [signing-identity]
#
# Arguments:
#   source.app        Path to the Tauri-built .app bundle.
#   output.dmg        Destination path for the resulting DMG file.
#   signing-identity  Optional. codesign identity, e.g. "Developer ID Application: ..."
#                     Skip or leave empty to produce an unsigned bundle (ad-hoc).

set -euo pipefail

SOURCE_APP="${1:?Usage: $0 <source.app> <output.dmg> [signing-identity]}"
OUTPUT_DMG="${2:?Usage: $0 <source.app> <output.dmg> [signing-identity]}"
SIGN_IDENTITY="${3:-}"

if [[ ! -d "$SOURCE_APP" ]]; then
    echo "Error: source app not found: $SOURCE_APP" >&2
    exit 1
fi

APP_NAME="$(basename "$SOURCE_APP")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

APP_COPY="$WORK_DIR/$APP_NAME"
cp -R "$SOURCE_APP" "$APP_COPY"

MACOS_DIR="$APP_COPY/Contents/MacOS"
PLIST="$APP_COPY/Contents/Info.plist"

# Read the real binary name that Tauri set as CFBundleExecutable.
REAL_BINARY="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$PLIST")"
echo "Real binary: $REAL_BINARY"

# Write the launcher script next to the real binary.
LAUNCHER="$MACOS_DIR/launch-server.sh"
printf '#!/usr/bin/env bash\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$DIR/%s" --mode server "$@"\n' \
    "$REAL_BINARY" > "$LAUNCHER"
chmod +x "$LAUNCHER"

# Point the bundle at the launcher instead of the binary.
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable launch-server.sh" "$PLIST"

# (Re-)sign if an identity was supplied.
# Modifying any file inside the bundle breaks the existing Tauri signature, so
# we must re-sign even if Tauri already signed the original.
if [[ -n "$SIGN_IDENTITY" ]]; then
    echo "Signing with identity: $SIGN_IDENTITY"
    # Sign the launcher script explicitly first.
    codesign --force --sign "$SIGN_IDENTITY" --options runtime "$LAUNCHER"
    # Deep-sign the whole bundle (picks up the real binary and all frameworks).
    codesign --force --deep --sign "$SIGN_IDENTITY" --options runtime "$APP_COPY"
else
    echo "No signing identity provided — skipping codesign."
fi

# Create the DMG.  hdiutil's -srcfolder puts everything in WORK_DIR into the
# volume, so only the single .app ends up there.
VOL_NAME="$(basename "$OUTPUT_DMG" .dmg)"
hdiutil create \
    -volname "$VOL_NAME" \
    -srcfolder "$WORK_DIR" \
    -ov \
    -format UDZO \
    "$OUTPUT_DMG"

echo "Server DMG created: $OUTPUT_DMG"
