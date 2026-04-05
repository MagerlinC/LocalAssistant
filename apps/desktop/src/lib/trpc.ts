import { createTRPCReact } from '@trpc/react-query';
import { createWSClient, wsLink, splitLink, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@local-assistant/backend/src/routers';

export const trpc = createTRPCReact<AppRouter>();

// VITE_BACKEND_URL is set to an explicit empty string only in the web/Docker
// build (Dockerfile.web), where nginx proxies /trpc on the same origin.
// In Tauri and local dev it is undefined, so we fall back to localhost:3001.
const isWebProxyMode = import.meta.env.VITE_BACKEND_URL === '';

const BACKEND_URL = isWebProxyMode ? '' : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

function getWsUrl(): string {
  if (isWebProxyMode) {
    // Same-origin nginx proxy — derive from the current page host.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  // Tauri or local dev — backend is always on its own port.
  return import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
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
