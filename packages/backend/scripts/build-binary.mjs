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
import * as esbuild from 'esbuild';

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

// esbuild plugin: inject per-module __dirname / __filename so that
// packages like jsdom that use fs.readFileSync(path.join(__dirname, ...))
// resolve to their original source locations rather than the bundle output dir.
const injectDirnamePlugin = {
  name: 'inject-dirname',
  setup(build) {
    build.onLoad({ filter: /\.(js|cjs)$/, namespace: 'file' }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      // Skip if no __dirname/__filename usage, or if the file uses import.meta
      // (ESM files — esbuild already handles import.meta.url natively).
      if (!source.includes('__dirname') && !source.includes('__filename')) return null;
      if (source.includes('import.meta')) return null;
      const dir = JSON.stringify(path.dirname(args.path));
      const file = JSON.stringify(args.path);
      // Prepend declarations that shadow the bundle-level __dirname/__filename.
      const contents = `var __dirname=${dir};var __filename=${file};\n${source}`;
      return { contents, loader: 'js' };
    });
  },
};

// esbuild plugin: rewrite the `createRequire(import.meta.url)` + `require('./x.json')`
// pattern used by css-tree and similar ESM packages.  When bundled to CJS,
// import.meta.url becomes undefined which crashes createRequire.  We replace
// each such require call with a direct ESM import that esbuild can inline.
const fixCreateRequirePlugin = {
  name: 'fix-create-require',
  setup(build) {
    build.onLoad({ filter: /\.js$/, namespace: 'file' }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      if (!source.includes('createRequire') || !source.includes('import.meta.url')) return null;

      // Replace: import { createRequire } from 'module';
      //          const req = createRequire(import.meta.url);
      //          const x   = req('./foo.json');
      // With:    import x from './foo.json';
      let contents = source
        // Remove the 'module' import
        .replace(/^import\s+\{[^}]*createRequire[^}]*\}\s+from\s+['"]module['"];?\n?/m, '')
        // Remove const req = createRequire(import.meta.url);
        .replace(/^const\s+\w+\s*=\s*createRequire\(import\.meta\.url\);?\n?/m, '')
        // Replace: const x = req('./foo.json'); → import x from './foo.json';
        .replace(
          /^const\s+(\w+)\s*=\s*\w+\((['"][^'"]+\.json['"])\);?\n?/m,
          (_, varName, jsonPath) => `import ${varName} from ${jsonPath};\n`,
        );

      return { contents, loader: 'js' };
    });
  },
};

// Bundle with esbuild first: transpiles ESM deps → CJS, resolves the entire
// dep tree into one file (except native addons which stay external).
const bundledEntry = path.join(BACKEND_DIR, 'dist', 'bundled.js');
console.log('Bundling with esbuild...');
await esbuild.build({
  entryPoints: [path.join(BACKEND_DIR, 'dist', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundledEntry,
  // Keep native addon as external — it's included as a pkg asset instead.
  external: ['better-sqlite3'],
  target: 'node22',
  plugins: [fixCreateRequirePlugin, injectDirnamePlugin],
  logLevel: 'warning',
});
console.log('  esbuild bundle complete.');

// Copy xhr-sync-worker.js next to the bundle so that require.resolve('./xhr-sync-worker.js')
// resolves correctly at runtime (the bundle lives in dist/, so the worker must too).
const xhrWorkerSrc = path.resolve(
  ROOT,
  'node_modules/.pnpm/jsdom@29.0.1/node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js',
);
const xhrWorkerDest = path.join(BACKEND_DIR, 'dist', 'xhr-sync-worker.js');
fs.copyFileSync(xhrWorkerSrc, xhrWorkerDest);
console.log('  Copied xhr-sync-worker.js to dist/');

for (const target of targetList) {
  const { pkgName, tauriName } = TARGETS[target];
  console.log(`\nBuilding ${target} → ${tauriName} ...`);

  const pkgExe = path.resolve(BACKEND_DIR, 'node_modules', '.bin', 'pkg');
  const configFile = path.join(BACKEND_DIR, 'pkg.config.json');

  // Run pkg from the repo root so asset paths resolve against the same root
  // that pkg uses for its snapshot (the common ancestor of all bundled files).
  execSync(
    `"${pkgExe}" "${bundledEntry}" --target ${target} --config ${configFile} --output ${path.join(BIN_OUT, pkgName)}`,
    { cwd: ROOT, stdio: 'inherit' }
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
