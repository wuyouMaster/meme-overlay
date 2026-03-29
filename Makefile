.PHONY: build build-dev dev check check-ts check-rust install server-dmg clean help

PLATFORM ?= $(shell uname -s | tr '[:upper:]' '[:lower:]')
ARCH ?= $(shell uname -m)

# Rust target triple inferred from the current machine (macOS only).
# Override with: make server-dmg RUST_TARGET=x86_64-apple-darwin
ifeq ($(ARCH),arm64)
  RUST_TARGET ?= aarch64-apple-darwin
else
  RUST_TARGET ?= x86_64-apple-darwin
endif

help:
	@echo "opencode-overlay build targets:"
	@echo ""
	@echo "  make build          Release build (current platform)"
	@echo "  make build-dev      Debug build"
	@echo "  make dev            Run in dev mode"
	@echo "  make check          Type-check all code"
	@echo "  make install        Install binary to ~/.config/meme-overlay/"
	@echo "  make server-dmg     Build release, then create server-mode DMG (macOS)"
	@echo "  make clean          Clean build artifacts"
	@echo ""
	@echo "Cross-platform:"
	@echo "  make build TARGET=x86_64-apple-darwin"
	@echo "  make build TARGET=aarch64-apple-darwin"
	@echo "  make build TARGET=x86_64-unknown-linux-gnu"
	@echo "  make build TARGET=x86_64-pc-windows-msvc"

build:
	npm run tauri build

build-dev:
	npm run tauri build -- --debug

dev:
	npm run tauri dev

check: check-ts check-rust

check-ts:
	npx tsc --noEmit

check-rust:
	cd src-tauri && cargo check

install: build
	@echo "Installing meme-overlay..."
	@mkdir -p ~/.config/meme-overlay/bin
	@mkdir -p ~/.config/meme-overlay/animations
	@cp src-tauri/target/release/meme-overlay ~/.config/meme-overlay/bin/
	@echo "Installed binary to ~/.config/meme-overlay/bin/meme-overlay"

# Build the release binary + app bundle, then wrap it into a server-mode DMG.
# The DMG's .app uses a shell launcher (launch-server.sh) as CFBundleExecutable
# so double-clicking opens the Settings window (--mode server) directly.
#
# We always pass --target explicitly so that Tauri places the output under
# src-tauri/target/<triple>/release/… instead of src-tauri/target/release/….
#
# Optional: set APPLE_SIGNING_IDENTITY to codesign the bundle, e.g.:
#   make server-dmg APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
server-dmg:
	@echo "Building release for $(RUST_TARGET)..."
	npx tauri build --target $(RUST_TARGET)
	@echo "Creating server-mode DMG..."
	@chmod +x scripts/make-server-dmg.sh
	@APP_PATH="src-tauri/target/$(RUST_TARGET)/release/bundle/macos/meme-overlay.app"; \
	 if [ ! -d "$$APP_PATH" ]; then \
	   echo "Error: .app not found at $$APP_PATH"; \
	   exit 1; \
	 fi; \
	 ./scripts/make-server-dmg.sh \
	   "$$APP_PATH" \
	   "meme-overlay-server-$(RUST_TARGET).dmg" \
	   "$(APPLE_SIGNING_IDENTITY)"
	@cp "src-tauri/target/$(RUST_TARGET)/release/meme-overlay" \
	    "meme-overlay-$(RUST_TARGET)"
	@echo "Done:"
	@echo "  meme-overlay-$(RUST_TARGET)              (client binary)"
	@echo "  meme-overlay-server-$(RUST_TARGET).dmg   (server DMG)"

clean:
	cd src-tauri && cargo clean
	rm -rf dist
	rm -rf node_modules
