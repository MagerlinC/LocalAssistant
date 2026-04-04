import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import http from 'http';
import { appRouter } from './routers';
import { getDb } from './db/schema';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Initialize DB
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
  console.log(`LocalAssistant backend running on http://localhost:${PORT}`);
  console.log(`WebSocket ready on ws://localhost:${PORT}/trpc`);
});

process.on('SIGTERM', () => {
  server.close();
  wss.close();
});
