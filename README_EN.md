# meme-overlay

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Lottie-Animations-00DDB3?style=flat-square&logo=lottiefiles&logoColor=white" alt="Lottie">
  <img src="https://img.shields.io/github/license/wuyouMaster/meme-overlay?style=flat-square" alt="License">
</p>

<p align="center">
  A floating animation overlay desktop app for AI coding assistants
</p>

<p align="center">
  <a href="./README.md">中文</a> | English
</p>

---

## ✨ Introduction

meme-overlay is a lightweight desktop application built with [Tauri v2](https://tauri.app) that provides a floating animation overlay for [OpenCode](https://github.com/sst/opencode) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

It consists of three core components:
- **Overlay window** — Transparent, always-on-top, draggable animation display
- **Settings window** — Animation management, hook configuration, online resource search
- **System tray** — Quick access to settings and exit

---

## ✨ Features

### Overlay

- Transparent background, always on top
- Freely draggable positioning
- Supports Lottie / GIF / MP4 / Image animations
- Real-time task progress text display
- Automatic response to plugin commands

### Settings Panel

- 📁 Import custom animations (Lottie JSON / GIF / MP4 / Images)
- 🎨 Assign separate animations for OpenCode and Claude Code hooks
- ✏️ Customize display text for each hook
- 🔄 Search and import animations from LottieFiles online
- 🗂️ Animation library management (rename, delete, batch operations)
- 🌐 Bilingual interface (Chinese / English)

### Supported Animation Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Lottie | `.json` | Vector animation, small size, smooth rendering |
| GIF | `.gif` | Animated images |
| Video | `.mp4`, `.webm` | Video files |
| Image | `.png`, `.jpg` | Static images |

---

## 📦 Installation

### Prerequisites

| Dependency | Version | Description |
|-----------|---------|-------------|
| [Rust](https://rustup.rs/) | 1.77+ | Tauri backend compilation |
| [Node.js](https://nodejs.org/) | 18+ | Frontend build |

**Supported Platforms**: macOS (Intel/Apple Silicon) · Linux (x64) · Windows (x64)

### Build from Source

```bash
git clone https://github.com/wuyouMaster/opencode-overlay.git
cd opencode-overlay

# Install frontend dependencies
npm install

# Build
make build

# Install to ~/.config/meme-overlay/
make install
```

### Development Mode

```bash
# Start development mode (hot reload)
make dev

# Type checking
make check
```

---

## 🚀 Usage

### With OpenCode

1. After installation, edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["/path/to/opencode-plugin/dist/opencode-meme.js"]
}
```

2. Start OpenCode and the overlay will appear automatically.

### With Claude Code

1. Edit `~/.claude/settings.json` and add hook configuration (see [cc-meme](https://github.com/wuyouMaster/cc-meme) docs).
2. Start Claude Code and the overlay will appear automatically.

### System Tray

Right-click the system tray icon:
- ⚙️ **Open Settings** — Manage animations and hook configuration
- 🚪 **Exit** — Close the overlay application

---

## ⚙️ Configuration

### Directory Structure

```
~/.config/meme-overlay/
├── config.json              # Hook animation assignment config
├── bookmarks.json           # macOS Security-Scoped Bookmarks
├── animations/              # Custom animation files directory
│   ├── coding.json
│   ├── thinking.gif
│   └── success.mp4
└── bin/
    └── meme-overlay         # Executable
```

### config.json

```json
{
  "opencode": {
    "hook_assignments": {
      "session.created": {
        "animation": "thinking",
        "custom_text": "Starting..."
      },
      "session.idle": {
        "animation": "success",
        "custom_text": "Done"
      }
    }
  },
  "cc": {
    "hook_assignments": {
      "cc.session.start": {
        "animation": "thinking",
        "custom_text": "Starting..."
      },
      "cc.stop": {
        "animation": "success",
        "custom_text": "Done"
      }
    }
  }
}
```

---

## 🛠️ Development

### Project Structure

```
opencode-overlay/
├── src/                        # React frontend source
│   ├── animations/             # Default animation data
│   ├── hooks/                  # React hooks
│   ├── i18n/                   # Internationalization (CN/EN)
│   ├── styles/                 # Stylesheets
│   └── windows/
│       ├── overlay/            # Overlay window components
│       └── settings/           # Settings window components
├── src-tauri/                  # Rust backend source
│   ├── src/                    # Tauri commands and state management
│   ├── capabilities/           # Tauri permission config
│   └── tauri.conf.json         # Tauri configuration
├── overlay.html                # Overlay entry HTML
├── settings.html               # Settings entry HTML
├── Makefile                    # Build scripts
├── vite.config.ts              # Vite configuration
└── package.json
```

### Common Commands

```bash
# Development mode
make dev

# Type checking (TypeScript + Rust)
make check

# TypeScript only
make check-ts

# Rust only
make check-rust

# Release build
make build

# Debug build
make build-dev

# Install to system
make install

# Clean build artifacts
make clean
```

### Cross-platform Build

```bash
# macOS Apple Silicon
make build TARGET=aarch64-apple-darwin

# macOS Intel
make build TARGET=x86_64-apple-darwin

# Linux x64
make build TARGET=x86_64-unknown-linux-gnu

# Windows x64
make build TARGET=x86_64-pc-windows-msvc
```

### Architecture

```
┌──────────────────────────────┐
│     Plugin (cc/opencode)      │
│         stdin JSON            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Tauri v2 App (Rust)      │
│  ┌────────────────────────┐  │
│  │   Overlay Window       │  │  ← Transparent, on-top, draggable
│  │   React + lottie-web   │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   Settings Window      │  │  ← Animation mgmt, hook config
│  │   React                │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   System Tray          │  │  ← Quick access
│  └────────────────────────┘  │
└──────────────────────────────┘
```

---

## 🔧 Troubleshooting

| Issue | Steps |
|-------|-------|
| App won't start | Check Rust version is 1.77+, run `rustup update` |
| Build fails | Run `make clean && npm install && make build` |
| Overlay not transparent | macOS requires `macOSPrivateApi` (pre-configured) |
| Animations not playing | Check animation file format, check console errors |

---

## 📄 License

[MIT](LICENSE)
