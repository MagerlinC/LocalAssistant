#!/usr/bin/env node
/**
 * Downloads the platform-appropriate Ollama binary and places it in
 * apps/desktop/src-tauri/bin/ with Tauri's target-triple naming convention.
 *
 * Usage:
 *   node scripts/download-ollama.mjs          # current platform only
 *   node scripts/download-ollama.mjs --all    # all supported platforms
 *
 * Ollama releases: https://github.com/ollama/ollama/releases
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAURI_BIN = path.resolve(__dirname, '..', 'apps', 'desktop', 'src-tauri', 'bin');

// Pin to a tested release. Update this when upgrading Ollama.
const OLLAMA_VERSION = 'v0.20.2';

// macOS ships as ollama-darwin.tgz containing the `ollama` universal binary.
// Windows ships as a plain .exe.
const PLATFORMS = {
  'darwin-arm64': {
    url: `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin.tgz`,
    tauriName: 'ollama-aarch64-apple-darwin',
    extract: 'tgz', // extract `ollama` binary from the archive
  },
  'darwin-x64': {
    url: `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin.tgz`,
    tauriName: 'ollama-x86_64-apple-darwin',
    extract: 'tgz',
  },
  'win32-x64': {
    url: `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-windows-amd64.exe`,
    tauriName: 'ollama-x86_64-pc-windows-msvc.exe',
    extract: null,
  },
};

function currentKey() {
  return `${os.platform()}-${os.arch()}`;
}

const buildAll = process.argv.includes('--all');
const keys = buildAll ? Object.keys(PLATFORMS) : [currentKey()];

fs.mkdirSync(TAURI_BIN, { recursive: true });

for (const key of keys) {
  const entry = PLATFORMS[key];
  if (!entry) {
    console.warn(`No Ollama binary mapping for platform "${key}" — skipping.`);
    continue;
  }

  const dest = path.join(TAURI_BIN, entry.tauriName);

  // Skip only if a real binary (> 1 MB) is already present.
  // Dev stubs created by create-dev-stubs.mjs are tiny and get overwritten.
  const REAL_BINARY_MIN_BYTES = 1 * 1024 * 1024;
  if (fs.existsSync(dest) && fs.statSync(dest).size >= REAL_BINARY_MIN_BYTES) {
    console.log(`  Already present: ${entry.tauriName} — skipping download.`);
    continue;
  }

  console.log(`Downloading Ollama ${OLLAMA_VERSION} for ${key}…`);
  console.log(`  URL : ${entry.url}`);
  console.log(`  Dest: ${dest}`);

  if (entry.extract === 'tgz') {
    // Download the tgz to a temp file then extract just the `ollama` binary.
    const tmp = dest + '.tgz';
    execSync(`curl -L --progress-bar "${entry.url}" -o "${tmp}"`, { stdio: 'inherit' });
    execSync(`tar -xzf "${tmp}" -C "${TAURI_BIN}" ollama`, { stdio: 'inherit' });
    fs.renameSync(path.join(TAURI_BIN, 'ollama'), dest);
    fs.rmSync(tmp);
    fs.chmodSync(dest, 0o755);
  } else if (os.platform() === 'win32') {
    execSync(
      `powershell -Command "Invoke-WebRequest -Uri '${entry.url}' -OutFile '${dest}'"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`curl -L --progress-bar "${entry.url}" -o "${dest}"`, { stdio: 'inherit' });
    fs.chmodSync(dest, 0o755);
  }

  console.log(`  ✓ Saved as src-tauri/bin/${entry.tauriName}`);
}

console.log('\nOllama download complete.');
