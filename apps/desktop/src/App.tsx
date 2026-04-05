import { useEffect } from "react";
import {
  AppShell,
  Group,
  Text,
  ActionIcon,
  useMantineColorScheme,
  Box,
  Avatar,
} from "@mantine/core";
import { IconSun, IconMoon, IconRobot } from "@tabler/icons-react";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import { trpc } from "./lib/trpc";
import { useApp } from "./context/AppContext";

const DEFAULT_APP_NAME = "LocalAssistant";

export default function App() {
  const { selectedChatId, appName, setAppName, setAvatarUrl } = useApp();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const { data: appSettings } = trpc.chat.getAppSettings.useQuery();

  useEffect(() => {
    if (appSettings) {
      setAppName(appSettings.appName);
      setAvatarUrl(appSettings.avatarDataUrl);
    }
  }, [appSettings, setAppName, setAvatarUrl]);

  const displayName = appName.trim() || DEFAULT_APP_NAME;

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 260, breakpoint: "sm" }}
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
            {colorScheme === "dark" ? (
              <IconSun size={18} />
            ) : (
              <IconMoon size={18} />
            )}
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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
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
