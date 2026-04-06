import path from 'path';
import os from 'os';
import fs from 'fs';

// ── pkg native-module bootstrap ─────────────────────────────────────────────
// Must run before getDb() is first called.
// When bundled with @yao-pkg/pkg the better_sqlite3.node asset lives inside
// the snapshot virtual FS.  dlopen() needs a real filesystem path, so we copy
// it out to $TMPDIR on first launch.
if ((process as any).pkg) {
  // Read --data-dir CLI arg as a fallback in case Tauri's envs() doesn't
  // propagate env vars to the sidecar on some platforms.
  const dataDirIdx = process.argv.indexOf('--data-dir');
  if (dataDirIdx !== -1 && process.argv[dataDirIdx + 1]) {
    process.env.DATA_DIR = process.argv[dataDirIdx + 1];
  }

  try {
    const bindingDir = path.join(os.tmpdir(), 'localassistant-native');
    fs.mkdirSync(bindingDir, { recursive: true });
    const dest = path.join(bindingDir, 'better_sqlite3.node');
    if (!fs.existsSync(dest)) {
      // __dirname inside a pkg snapshot resolves to the dist/ snapshot dir.
      // The asset was included relative to the project root so it lives one
      // level up at node_modules/better-sqlite3/build/Release/.
      const src = path.join(
        __dirname,
        '..',
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node'
      );
      const data = fs.readFileSync(src);  // reads from pkg virtual FS
      fs.writeFileSync(dest, data);       // writes to real FS
    }
    process.env.BETTER_SQLITE3_NATIVE_BINDING = dest;
  } catch (e) {
    console.error('Warning: could not extract native binding:', e);
  }
}
// ────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import { appRouter } from './routers';
import { getDb } from './db/schema';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Initialize DB (uses BETTER_SQLITE3_NATIVE_BINDING if set above)
getDb();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// tRPC HTTP handler (for queries/mutations)
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}),
  })
);

const server = http.createServer(app);

// WebSocket server for subscriptions (streaming)
const wss = new WebSocketServer({ server, path: '/trpc' });

applyWSSHandler({
  wss,
  router: appRouter,
  createContext: () => ({}),
});

server.listen(PORT, () => {
  process.stderr.write(`LocalAssistant backend running on http://localhost:${PORT}\n`);
  process.stderr.write(`WebSocket ready on ws://localhost:${PORT}/trpc\n`);
});

process.on('SIGTERM', () => {
  server.close();
  wss.close();
});
