import { createTRPCReact } from '@trpc/react-query';
import { createWSClient, wsLink, splitLink, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@local-assistant/backend/src/routers';

export const trpc = createTRPCReact<AppRouter>();

// In web/Docker mode these env vars are empty strings — nginx proxies /trpc
// on the same origin so no absolute URL is needed.
// In Tauri / local dev they point to localhost:3001.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Derive WebSocket URL: if running in web/Docker mode (same-origin nginx proxy)
// use the current page host so nginx can upgrade the connection.
function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:3001';
}

const wsClient = createWSClient({
  url: `${getWsUrl()}/trpc`,
  retryDelayMs: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
});

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({
        url: BACKEND_URL ? `${BACKEND_URL}/trpc` : '/trpc',
      }),
    }),
  ],
});
