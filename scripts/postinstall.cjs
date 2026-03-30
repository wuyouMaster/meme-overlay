#!/usr/bin/env node
// Downloads the platform-specific meme-overlay binary from GitHub Releases.
// Runs automatically after `npm install`.
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REPO = "wuyouMaster/meme-overlay";
const VERSION = process.env.npm_package_version || require("../package.json").version;

// Map Node.js platform/arch → GitHub Release asset filename
function getBinaryName() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin" && arch === "arm64") {
    return "meme-overlay-aarch64-apple-darwin";
  }
  if (platform === "darwin" && arch === "x64") {
    return "meme-overlay-x86_64-apple-darwin";
  }
  if (platform === "win32" && arch === "x64") {
    return "meme-overlay-x86_64-pc-windows-msvc.exe";
  }

  return null;
}

function download(url, destPath, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error("Too many redirects"));

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "meme-overlay-installer" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return download(res.headers.location, destPath, redirects + 1)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  const binaryName = getBinaryName();
  if (!binaryName) {
    console.warn(
      `[meme-overlay] Unsupported platform: ${os.platform()} ${os.arch()}. ` +
        `Skipping binary download. Build from source: https://github.com/${REPO}`
    );
    return;
  }

  const isWindows = os.platform() === "win32";
  const destName = isWindows ? "meme-overlay.exe" : "meme-overlay";
  const destDir = path.join(os.homedir(), ".config", "meme-overlay", "bin");
  const destPath = path.join(destDir, destName);

  // Skip if already downloaded (e.g. repeated npm install in dev)
  if (fs.existsSync(destPath)) {
    console.log(`[meme-overlay] Binary already present at ${destPath}`);
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });

  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${binaryName}`;
  console.log(`[meme-overlay] Downloading ${binaryName} v${VERSION}…`);
  console.log(`[meme-overlay]   from: ${url}`);
  console.log(`[meme-overlay]   to:   ${destPath}`);

  try {
    await download(url, destPath);
    if (!isWindows) {
      fs.chmodSync(destPath, 0o755);
    }
    console.log(`[meme-overlay] Download complete.`);
  } catch (err) {
    // Non-fatal: warn but don't break npm install
    fs.unlink(destPath, () => {});
    console.warn(
      `[meme-overlay] WARNING: Could not download binary: ${err.message}\n` +
        `  You can download it manually from:\n` +
        `  https://github.com/${REPO}/releases/tag/v${VERSION}\n` +
        `  and place it at: ${destPath}`
    );
  }
}

main();
