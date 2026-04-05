#!/usr/bin/env node
/**
 * Creates minimal placeholder binaries in apps/desktop/src-tauri/bin/ so that
 * Tauri's build script (which validates externalBin paths) passes during dev.
 *
 * The stubs are never launched — main.rs uses #[cfg(not(debug_assertions))] to
 * skip sidecar startup in dev mode. Real binaries built by `pnpm build:dist`
 * are always larger than 1 MB and will overwrite these stubs automatically.
 *
 * Usage: node scripts/create-dev-stubs.mjs
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAURI_BIN = path.resolve(__dirname, '..', 'apps', 'desktop', 'src-tauri', 'bin');

const STUB_CONTENT = `#!/bin/sh
# Dev stub — not a real binary.
# Run 'pnpm build:dist' to install production binaries.
echo "[LocalAssistant] dev stub, not a real binary" >&2
exit 1
`;

// Real binaries are always > 1 MB; stubs are a few hundred bytes.
const REAL_BINARY_MIN_BYTES = 1 * 1024 * 1024;

function currentTriple() {
  const p = os.platform();
  const a = os.arch();
  if (p === 'darwin' && a === 'arm64') return 'aarch64-apple-darwin';
  if (p === 'darwin' && a === 'x64')   return 'x86_64-apple-darwin';
  if (p === 'win32'  && a === 'x64')   return 'x86_64-pc-windows-msvc';
  throw new Error(`Unsupported platform: ${p}/${a}`);
}

const triple = currentTriple();
const isWindows = os.platform() === 'win32';
const ext = isWindows ? '.exe' : '';

const stubs = [
  `ollama-${triple}${ext}`,
  `backend-${triple}${ext}`,
];

fs.mkdirSync(TAURI_BIN, { recursive: true });

for (const name of stubs) {
  const dest = path.join(TAURI_BIN, name);

  if (fs.existsSync(dest) && fs.statSync(dest).size >= REAL_BINARY_MIN_BYTES) {
    console.log(`  Skipping ${name} — real binary already present.`);
    continue;
  }

  if (isWindows) {
    // Windows: write a minimal batch stub
    fs.writeFileSync(dest, '@echo Dev stub — not a real binary.\r\n@exit /b 1\r\n', 'utf8');
  } else {
    fs.writeFileSync(dest, STUB_CONTENT, 'utf8');
    fs.chmodSync(dest, 0o755);
  }

  console.log(`  Created stub: src-tauri/bin/${name}`);
}

console.log('\nDev stubs ready. Run `pnpm build:dist` to replace with real binaries.');
