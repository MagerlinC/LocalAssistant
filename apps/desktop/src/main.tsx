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

const theme = createTheme({
  primaryColor: 'violet',
  fontFamily: 'system-ui, sans-serif',
  defaultRadius: 'md',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Notifications />
          <AppProvider>
            <App />
          </AppProvider>
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);
