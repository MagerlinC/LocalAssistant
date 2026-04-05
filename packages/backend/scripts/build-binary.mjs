#!/usr/bin/env node
/**
 * Builds the backend into platform-specific self-contained binaries using
 * @yao-pkg/pkg and copies them into apps/desktop/src-tauri/bin/ with the
 * Rust target-triple naming that Tauri's externalBin expects.
 *
 * Run: node scripts/build-binary.mjs [--targets <t1,t2,...>]
 *
 * Default targets: current platform only (for faster CI / local builds).
 * Pass --all to build for all three platforms.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_DIR = path.resolve(__dirname, '..');
const BIN_OUT = path.join(BACKEND_DIR, 'dist', 'bin');
const TAURI_BIN = path.resolve(ROOT, 'apps', 'desktop', 'src-tauri', 'bin');

// Map: pkg target → { outName (pkg output), tauriName (Tauri triple) }
const TARGETS = {
  'node22-macos-arm64': {
    pkgName: 'backend-macos-arm64',
    tauriName: 'backend-aarch64-apple-darwin',
  },
  'node22-macos-x64': {
    pkgName: 'backend-macos-x64',
    tauriName: 'backend-x86_64-apple-darwin',
  },
  'node22-win-x64': {
    pkgName: 'backend-win-x64.exe',
    tauriName: 'backend-x86_64-pc-windows-msvc.exe',
  },
};

function currentPkgTarget() {
  const p = os.platform();
  const a = os.arch();
  if (p === 'darwin' && a === 'arm64') return 'node22-macos-arm64';
  if (p === 'darwin' && a === 'x64')   return 'node22-macos-x64';
  if (p === 'win32'  && a === 'x64')   return 'node22-win-x64';
  throw new Error(`Unsupported platform: ${p}/${a}`);
}

const buildAll = process.argv.includes('--all');
const targetList = buildAll ? Object.keys(TARGETS) : [currentPkgTarget()];

fs.mkdirSync(BIN_OUT, { recursive: true });
fs.mkdirSync(TAURI_BIN, { recursive: true });

for (const target of targetList) {
  const { pkgName, tauriName } = TARGETS[target];
  console.log(`\nBuilding ${target} → ${tauriName} ...`);

  const pkgExe = path.resolve(BACKEND_DIR, 'node_modules', '.bin', 'pkg');
  const configFile = path.join(BACKEND_DIR, 'pkg.config.json');

  // Override outputPath per-target so we get distinct filenames
  execSync(
    `"${pkgExe}" dist/index.js --target ${target} --config ${configFile} --output ${path.join(BIN_OUT, pkgName)}`,
    { cwd: BACKEND_DIR, stdio: 'inherit' }
  );

  const src = path.join(BIN_OUT, pkgName);
  const dest = path.join(TAURI_BIN, tauriName);
  fs.copyFileSync(src, dest);
  if (os.platform() !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }
  console.log(`  → copied to src-tauri/bin/${tauriName}`);
}

console.log('\nBackend binary build complete.');
