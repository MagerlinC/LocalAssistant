import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider, createTheme } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';
import App from './App';
import { trpc, trpcClient } from './lib/trpc';
import { AppProvider, useApp } from './context/AppContext';

// Mantine's built-in violet[6] — used when no accent has been saved yet.
const DEFAULT_ACCENT = '#7950f2';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/**
 * Reads accentColor from AppContext and rebuilds the Mantine theme around it.
 * Must live inside AppProvider so it can call useApp().
 */
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { accentColor } = useApp();

  const theme = useMemo(() => {
    const hex = accentColor || DEFAULT_ACCENT;
    return createTheme({
      primaryColor: 'accent',
      colors: { accent: generateColors(hex) },
      fontFamily: 'system-ui, sans-serif',
      defaultRadius: 'md',
    });
  }, [accentColor]);

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications />
      {children}
    </MantineProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <ThemeWrapper>
            <App />
          </ThemeWrapper>
        </AppProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);
