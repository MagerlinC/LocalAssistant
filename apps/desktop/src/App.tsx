import { useEffect, useState } from "react";
import {
  AppShell,
  Group,
  Text,
  ActionIcon,
  useMantineColorScheme,
  Box,
  Avatar,
  Center,
  Loader,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import {
  IconSun,
  IconMoon,
  IconRobot,
  IconSettings,
} from "@tabler/icons-react";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import SetupWizard from "./components/SetupWizard";
import { trpc } from "./lib/trpc";
import { useApp } from "./context/AppContext";

const DEFAULT_APP_NAME = "LocalAssistant";

export default function App() {
  const {
    selectedChatId,
    appName,
    setAppName,
    setAvatarUrl,
    setupComplete,
    setSetupComplete,
  } = useApp();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [settingsOpened, { open: openSettings, close: closeSettings }] =
    useDisclosure(false);
  const [newChatOpened, { open: openNewChat, close: closeNewChat }] =
    useDisclosure(false);

  const closeModals = (e: KeyboardEvent) => {
    e.preventDefault();
    closeNewChat();
    closeSettings();
  };

  useHotkeys([
    ["mod+N", openNewChat],
    ["mod+S", openSettings],
    ["mod+T", toggleColorScheme],
    ["Escape", closeModals],
  ]);

  // Retry aggressively while the sidecar backend is still starting up.
  const { data: appSettings, isError: settingsError, error: settingsQueryError } =
    trpc.chat.getAppSettings.useQuery(undefined, {
      retry: 20,
      retryDelay: (attempt) => Math.min(500 * (attempt + 1), 3000),
    });
  const { data: models } =
    trpc.chat.getModels.useQuery(undefined, {
      enabled: !!appSettings,
      refetchInterval: 5000,
    });

  useEffect(() => {
    if (settingsQueryError) {
      notifications.show({
        color: "red",
        title: "Backend connection failed",
        message: settingsQueryError.message,
        autoClose: false,
      });
    }
  }, [settingsQueryError]);

  const [backendReady, setBackendReady] = useState(false);

  // Poll startup errors from the Tauri sidecar launcher via a command.
  // Using a command (not events) avoids the race where events fire before
  // the JS listener is registered.
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
    if (!isTauri) return;
    import("@tauri-apps/api/tauri").then(({ invoke }) => {
      invoke<string[]>("get_startup_errors").then((errors) => {
        for (const msg of errors) {
          notifications.show({
            color: "red",
            title: "Startup error",
            message: msg,
            autoClose: false,
          });
        }
      });
    });
  }, []);

  useEffect(() => {
    if (appSettings !== undefined) {
      setBackendReady(true);
      setAppName(appSettings.appName);
      setAvatarUrl(appSettings.avatarDataUrl);
      // If the user already completed setup (has a saved name), don't show
      // the wizard again just because Ollama is still starting.
      if (appSettings.appName) setSetupComplete(true);
    }
  }, [appSettings, setAppName, setAvatarUrl, setSetupComplete]);

  useEffect(() => {
    if (models !== undefined && !setupComplete) {
      if (models.length > 0) setSetupComplete(true);
      // models.length === 0 && no saved appName → first run, show SetupWizard
    }
  }, [models, setupComplete, setSetupComplete]);

  const displayName = appName.trim() || DEFAULT_APP_NAME;

  // ── Startup: waiting for sidecar backend ──────────────────────────────────
  if (settingsError) {
    return (
      <Center h="100vh">
        <Box ta="center">
          <Text size="lg" fw={600} c="red" mb="xs">
            Failed to start backend
          </Text>
          <Text size="sm" c="dimmed">
            Please quit and restart {DEFAULT_APP_NAME}.
          </Text>
        </Box>
      </Center>
    );
  }

  if (!backendReady) {
    return (
      <Center h="100vh">
        <Box ta="center">
          <Loader color="primary" size="lg" mb="md" />
          <Text size="sm" c="dimmed">
            Starting {DEFAULT_APP_NAME}…
          </Text>
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
              color="primary"
              variant="light"
            >
              <IconRobot size={18} />
            </Avatar>
            <Text fw={700} size="lg" c="primary">
              {displayName}
            </Text>
          </Group>
          <Group gap="xs">
            <Tooltip
              label={colorScheme === "dark" ? "Light mode" : "Dark mode"}
            >
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
            </Tooltip>
            <Tooltip label="Settings">
              <ActionIcon
                variant="subtle"
                onClick={openSettings}
                aria-label="Settings"
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={0}>
        <Sidebar
          settingsOpened={settingsOpened}
          onCloseSettings={closeSettings}
          newChatOpened={newChatOpened}
          onOpenNewChat={openNewChat}
          onCloseNewChat={closeNewChat}
        />
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
