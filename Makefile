.PHONY: build build-dev dev check check-ts check-rust install clean help

PLATFORM ?= $(shell uname -s | tr '[:upper:]' '[:lower:]')
ARCH ?= $(shell uname -m)

help:
	@echo "opencode-overlay build targets:"
	@echo ""
	@echo "  make build          Release build (current platform)"
	@echo "  make build-dev      Debug build"
	@echo "  make dev            Run in dev mode"
	@echo "  make check          Type-check all code"
	@echo "  make install        Install binary to ~/.config/meme-overlay/"
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

clean:
	cd src-tauri && cargo clean
	rm -rf dist
	rm -rf node_modules
