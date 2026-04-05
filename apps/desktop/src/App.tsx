import { useEffect, useState } from 'react';
import {
  AppShell, Group, Text, ActionIcon, useMantineColorScheme,
  Box, Avatar, Center, Loader,
} from '@mantine/core';
import { IconSun, IconMoon, IconRobot } from '@tabler/icons-react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SetupWizard from './components/SetupWizard';
import { trpc } from './lib/trpc';
import { useApp } from './context/AppContext';

const DEFAULT_APP_NAME = 'LocalAssistant';

export default function App() {
  const {
    selectedChatId, appName, setAppName, setAvatarUrl,
    setupComplete, setSetupComplete,
  } = useApp();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // Retry aggressively while the sidecar backend is still starting up.
  const { data: appSettings } = trpc.chat.getAppSettings.useQuery(undefined, {
    retry: 20,
    retryDelay: (attempt) => Math.min(500 * (attempt + 1), 3000),
  });
  const { data: models, isLoading: modelsLoading } = trpc.chat.getModels.useQuery(undefined, {
    retry: 10,
    retryDelay: (attempt) => Math.min(500 * (attempt + 1), 3000),
    enabled: !!appSettings,
  });

  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    if (appSettings !== undefined) {
      setBackendReady(true);
      setAppName(appSettings.appName);
      setAvatarUrl(appSettings.avatarDataUrl);
    }
  }, [appSettings, setAppName, setAvatarUrl]);

  useEffect(() => {
    if (models !== undefined && !setupComplete) {
      if (models.length > 0) setSetupComplete(true);
      // models.length === 0 → SetupWizard renders
    }
  }, [models, setupComplete, setSetupComplete]);

  const displayName = appName.trim() || DEFAULT_APP_NAME;

  // ── Startup: waiting for sidecar backend ──────────────────────────────────
  if (!backendReady || modelsLoading) {
    return (
      <Center h="100vh">
        <Box ta="center">
          <Loader color="violet" size="lg" mb="md" />
          <Text size="sm" c="dimmed">Starting {DEFAULT_APP_NAME}…</Text>
        </Box>
      </Center>
    );
  }

  // ── First run: no models installed yet ───────────────────────────────────
  if (!setupComplete) {
    return <SetupWizard />;
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 260, breakpoint: 'sm' }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Avatar
              src={appSettings?.avatarDataUrl || null}
              size={32}
              radius="md"
              color="violet"
              variant="light"
            >
              <IconRobot size={18} />
            </Avatar>
            <Text fw={700} size="lg" c="violet">
              {displayName}
            </Text>
          </Group>
          <ActionIcon
            variant="subtle"
            onClick={() => toggleColorScheme()}
            aria-label="Toggle color scheme"
          >
            {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={0}>
        <Sidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box h="calc(100vh - 52px)">
          {selectedChatId ? (
            <ChatView chatId={selectedChatId} />
          ) : (
            <Box h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text c="dimmed" size="lg">
                Select a chat or create a new one
              </Text>
            </Box>
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
