import { AppShell, Group, Text, ActionIcon, useMantineColorScheme, Box } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import { useApp } from './context/AppContext';

export default function App() {
  const { selectedChatId } = useApp();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 260, breakpoint: 'sm' }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700} size="lg" c="violet">
            LocalAssistant
          </Text>
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
            <Box
              h="100%"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
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
