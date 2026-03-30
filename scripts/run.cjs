#!/usr/bin/env node
// Thin shim: finds and spawns the native meme-overlay binary.
// Exposed as the `meme-overlay` CLI command via package.json `bin`.
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

function findBinary() {
  const isWindows = os.platform() === "win32";
  const ext = isWindows ? ".exe" : "";

  // 1. Installed by postinstall / `make install`
  const fromConfig = path.join(
    os.homedir(),
    ".config",
    "meme-overlay",
    "bin",
    `meme-overlay${ext}`
  );
  if (fs.existsSync(fromConfig)) return fromConfig;

  // 2. Built locally during development
  const devRelease = path.join(
    __dirname,
    "..",
    "src-tauri",
    "target",
    "release",
    `meme-overlay${ext}`
  );
  if (fs.existsSync(devRelease)) return devRelease;

  return null;
}

const bin = findBinary();
if (!bin) {
  console.error(
    "[meme-overlay] Binary not found.\n" +
      "  Run `npm install -g meme-overlay` to trigger the postinstall download,\n" +
      "  or download manually from https://github.com/wuyouMaster/meme-overlay/releases"
  );
  process.exit(1);
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
