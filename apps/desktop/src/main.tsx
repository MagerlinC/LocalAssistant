import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';
import App from './App';
import { trpc, trpcClient } from './lib/trpc';
import { AppProvider } from './context/AppContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Pearl Frost — soft periwinkle-lavender, 10 shades light → dark
const pearlColors: [string, string, string, string, string, string, string, string, string, string] = [
  '#f3f5ff',
  '#e6e9ff',
  '#cdd3ff',
  '#b0baf8',
  '#939eee',
  '#7986d8',
  '#6272ca',
  '#5162bb',
  '#4354ac',
  '#35469c',
];

const theme = createTheme({
  primaryColor: 'pearl',
  colors: { pearl: pearlColors },
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  defaultRadius: 'lg',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <MantineProvider theme={theme} defaultColorScheme="dark">
            <Notifications />
            <App />
          </MantineProvider>
        </AppProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);
