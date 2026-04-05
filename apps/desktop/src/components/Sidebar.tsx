import {
  Stack,
  Button,
  Text,
  ScrollArea,
  Group,
  ActionIcon,
  Modal,
  TextInput,
  Select,
  Textarea,
  NavLink,
  Divider,
  Loader,
  Avatar,
  Box,
  UnstyledButton,
  Tooltip,
  Badge,
  Progress,
  Tabs,
  ColorInput,
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconMessage,
  IconCamera,
  IconRobot,
  IconDownload,
} from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { trpc, trpcClient } from "../lib/trpc";
import { useApp } from "../context/AppContext";
import { DEFAULT_MODEL } from "@local-assistant/shared";

const DEFAULT_APP_NAME = "LocalAssistant";

/** Resize an image File/Blob to a square data URL via canvas. */
function resizeImageToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function formatModelSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

interface SidebarProps {
  settingsOpened: boolean;
  onCloseSettings: () => void;
}

export default function Sidebar({ settingsOpened, onCloseSettings }: SidebarProps) {
  const {
    selectedChatId,
    setSelectedChatId,
    setCurrentChat,
    appName,
    setAppName,
    avatarUrl,
    setAvatarUrl,
    accentColor,
    setAccentColor,
  } = useApp();
  const [newChatOpen, { open: openNewChat, close: closeNewChat }] =
    useDisclosure(false);
  const settingsOpen = settingsOpened;
  const closeSettings = onCloseSettings;
  const [newChatName, setNewChatName] = useState("");
  const [newChatModel, setNewChatModel] = useState(DEFAULT_MODEL);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [draftAccentColor, setDraftAccentColor] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Model pull state
  const [pullModelName, setPullModelName] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState("");
  const [pullPercent, setPullPercent] = useState<number | undefined>(undefined);
  const pullUnsubRef = useRef<{ unsubscribe: () => void } | null>(null);

  const utils = trpc.useUtils();

  const { data: chats = [], isLoading } = trpc.chat.getChats.useQuery();
  const { data: models, refetch: refetchModels } =
    trpc.chat.getModels.useQuery();
  const { data: savedDefaultPrompt } =
    trpc.chat.getDefaultSystemPrompt.useQuery();

  useEffect(() => {
    if (savedDefaultPrompt) setDefaultPrompt(savedDefaultPrompt);
  }, [savedDefaultPrompt]);

  useEffect(() => {
    if (settingsOpen) {
      setDraftName(appName);
      setDraftAvatar(avatarUrl);
      setDraftAccentColor(accentColor);
    } else {
      // Cancel any in-progress pull when modal closes
      pullUnsubRef.current?.unsubscribe();
      pullUnsubRef.current = null;
      setIsPulling(false);
      setPullStatus("");
      setPullPercent(undefined);
    }
  }, [settingsOpen, appName, avatarUrl]);

  const createChat = trpc.chat.createChat.useMutation({
    onSuccess: (chat) => {
      utils.chat.getChats.invalidate();
      setSelectedChatId(chat.id);
      setCurrentChat(chat);
      closeNewChat();
      setNewChatName("");
    },
    onError: (err) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const deleteChat = trpc.chat.deleteChat.useMutation({
    onSuccess: (_, vars) => {
      utils.chat.getChats.invalidate();
      if (selectedChatId === vars.chatId) setSelectedChatId(null);
    },
    onError: (err) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const setDefaultSystemPrompt = trpc.chat.setDefaultSystemPrompt.useMutation({
    onSuccess: () =>
      notifications.show({ color: "green", message: "Settings saved" }),
  });

  const setAppSettings = trpc.chat.setAppSettings.useMutation({
    onSuccess: () => {
      setAppName(draftName);
      setAvatarUrl(draftAvatar);
      setAccentColor(draftAccentColor);
      notifications.show({ color: "green", message: "Settings saved" });
      closeSettings();
    },
    onError: (err) =>
      notifications.show({ color: "red", message: err.message }),
  });

  const modelOptions = models?.map((m) => ({
    value: m.name,
    label: m.name,
  })) ?? [{ value: DEFAULT_MODEL, label: DEFAULT_MODEL }];

  function handleCreateChat() {
    if (!newChatName.trim()) return;
    createChat.mutate({ name: newChatName.trim(), model: newChatModel });
  }

  function handleSelectChat(chatId: string) {
    const chat = chats?.find((c) => c.id === chatId);
    setSelectedChatId(chatId);
    if (chat) setCurrentChat(chat);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 128);
      setDraftAvatar(dataUrl);
    } catch {
      notifications.show({ color: "red", message: "Failed to process image" });
    }
    e.target.value = "";
  }

  function handleSaveSettings() {
    setDefaultSystemPrompt.mutate({ prompt: defaultPrompt });
    setAppSettings.mutate({
      appName: draftName,
      avatarDataUrl: draftAvatar,
      accentColor: draftAccentColor,
    });
  }

  function handlePullModel() {
    const model = pullModelName.trim();
    if (!model || isPulling) return;

    setIsPulling(true);
    setPullStatus("Starting…");
    setPullPercent(undefined);

    const sub = trpcClient.chat.pullModel.subscribe(
      { model },
      {
        onData(event) {
          if (event.type === "progress") {
            setPullStatus(event.status ?? "");
            setPullPercent(event.percent);
          } else if (event.type === "done") {
            setIsPulling(false);
            setPullModelName("");
            setPullStatus("");
            setPullPercent(undefined);
            refetchModels();
            utils.chat.getModels.invalidate();
            notifications.show({
              color: "green",
              message: `${model} installed`,
            });
          } else if (event.type === "error") {
            setIsPulling(false);
            setPullStatus("");
            setPullPercent(undefined);
            notifications.show({
              color: "red",
              message: `Pull failed: ${event.error}`,
            });
          }
        },
        onError(err) {
          setIsPulling(false);
          setPullStatus("");
          setPullPercent(undefined);
          notifications.show({ color: "red", message: `Pull failed: ${err}` });
        },
      },
    );

    pullUnsubRef.current = sub;
  }

  const chatsGroupedByDate = chats.reduce(
    (groups, chat) => {
      const dateKey = new Date(chat.createdAt).toLocaleDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(chat);
      return groups;
    },
    {} as Record<string, typeof chats>,
  );

  const dateKeys = Object.keys(chatsGroupedByDate).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    return 0;
  });

  return (
    <>
      <Stack h="100%" gap={0}>
        <Stack p="sm" gap="xs">
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openNewChat}
            variant="light"
            size="sm"
            fullWidth
          >
            New Chat
          </Button>
        </Stack>

        <Divider />

        <ScrollArea flex={1} p="xs">
          {isLoading && (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          )}
          {dateKeys.map((dateKey) => (
            <div key={dateKey}>
              <Text size="xs" c="dimmed" mt="md" mb="xs" px="xs">
                {dateKey}
              </Text>
              {chatsGroupedByDate[dateKey].map((chat) => (
                <NavLink
                  key={chat.id}
                  label={
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" truncate flex={1}>
                        {chat.name}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat.mutate({ chatId: chat.id });
                        }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  }
                  leftSection={<IconMessage size={14} />}
                  active={selectedChatId === chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  style={{ borderRadius: 6 }}
                />
              ))}
            </div>
          ))}

          {!isLoading && chats?.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" p="md">
              No chats yet
            </Text>
          )}
        </ScrollArea>

      </Stack>

      {/* New Chat Modal */}
      <Modal
        opened={newChatOpen}
        onClose={closeNewChat}
        title="New Chat"
        centered
      >
        <Stack>
          <TextInput
            label="Chat name"
            placeholder="My analysis..."
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateChat()}
            data-autofocus
          />
          <Select
            label="Model"
            data={modelOptions}
            value={newChatModel}
            onChange={(v) => v && setNewChatModel(v)}
            searchable
          />
          <Button
            onClick={handleCreateChat}
            loading={createChat.isPending}
            disabled={!newChatName.trim()}
          >
            Create
          </Button>
        </Stack>
      </Modal>

      {/* Settings Modal */}
      <Modal
        opened={settingsOpen}
        onClose={closeSettings}
        title="Settings"
        centered
        size="lg"
      >
        <Tabs defaultValue="assistant">
          <Tabs.List mb="md">
            <Tabs.Tab value="assistant">Assistant</Tabs.Tab>
            <Tabs.Tab value="models">Models</Tabs.Tab>
            <Tabs.Tab value="appearance">Appearance</Tabs.Tab>
          </Tabs.List>

          {/* ── Assistant tab ── */}
          <Tabs.Panel value="assistant">
            <Stack>
              <Text size="sm" fw={600} c="dimmed">
                Personality
              </Text>

              <Group align="flex-start" justify="center" gap="md">
                <Box>
                  <Tooltip label="Click to change avatar">
                    <UnstyledButton
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Box
                        style={{
                          position: "relative",
                          display: "inline-block",
                        }}
                      >
                        <Avatar
                          src={draftAvatar || null}
                          size={64}
                          radius="md"
                          color="primary"
                          variant="light"
                        >
                          <IconRobot size={32} />
                        </Avatar>
                        <Box
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "var(--mantine-radius-md)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(0,0,0,0.45)",
                            opacity: 0,
                            transition: "opacity 0.15s",
                          }}
                          className="avatar-overlay"
                        >
                          <IconCamera size={20} color="white" />
                        </Box>
                      </Box>
                    </UnstyledButton>
                  </Tooltip>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleAvatarChange}
                  />
                </Box>

                <TextInput
                  flex={1}
                  label="Assistant name"
                  placeholder={DEFAULT_APP_NAME}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </Group>

              {draftAvatar && (
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => setDraftAvatar("")}
                >
                  Remove avatar
                </Button>
              )}

              <Divider />

              <Text size="sm" fw={600} c="dimmed">
                Default system prompt
              </Text>
              <Textarea
                description="Used for all new chats unless overridden per-chat"
                value={defaultPrompt}
                onChange={(e) => setDefaultPrompt(e.target.value)}
                minRows={5}
                autosize
              />

              <Button
                onClick={handleSaveSettings}
                loading={
                  setDefaultSystemPrompt.isPending || setAppSettings.isPending
                }
              >
                Save
              </Button>
            </Stack>
          </Tabs.Panel>

          {/* ── Appearance tab ── */}
          <Tabs.Panel value="appearance">
            <Stack>
              <Text size="sm" fw={600} c="dimmed">Accent color</Text>
              <Text size="xs" c="dimmed">
                Sets the primary color used throughout the app. Changes take
                effect after saving.
              </Text>
              <ColorInput
                label="Color"
                value={draftAccentColor}
                onChange={setDraftAccentColor}
                format="hex"
                swatches={[
                  '#7950f2', '#e64980', '#f03e3e', '#e67700',
                  '#2f9e44', '#0c8599', '#1971c2', '#6741d9',
                ]}
                swatchesPerRow={8}
              />
              <Button
                onClick={handleSaveSettings}
                loading={setAppSettings.isPending}
                mt="xs"
              >
                Save
              </Button>
            </Stack>
          </Tabs.Panel>

          {/* ── Models tab ── */}
          <Tabs.Panel value="models">
            <Stack>
              <Text size="sm" fw={600} c="dimmed">
                Installed models
              </Text>

              <Stack gap="xs">
                {models && models.length > 0 ? (
                  models.map((m) => (
                    <Group key={m.name} justify="space-between" px={4}>
                      <Text size="sm">{m.name}</Text>
                      <Badge size="xs" variant="light" color="gray">
                        {formatModelSize(m.size)}
                      </Badge>
                    </Group>
                  ))
                ) : (
                  <Text size="xs" c="dimmed">
                    No models installed
                  </Text>
                )}
              </Stack>

              <Divider />

              <Text size="sm" fw={600} c="dimmed">
                Pull a model
              </Text>
              <Text size="xs" c="dimmed">
                Find model names at ollama.com/library (e.g. llama3.2:3b,
                mistral, nomic-embed-text)
              </Text>

              <Group gap="xs">
                <TextInput
                  flex={1}
                  placeholder="e.g. llama3.2:3b"
                  value={pullModelName}
                  onChange={(e) => setPullModelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePullModel()}
                  disabled={isPulling}
                />
                <Button
                  leftSection={<IconDownload size={14} />}
                  variant="light"
                  onClick={handlePullModel}
                  loading={isPulling}
                  disabled={!pullModelName.trim()}
                >
                  Pull
                </Button>
              </Group>

              {isPulling && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" truncate>
                    {pullStatus}
                  </Text>
                  <Progress
                    value={pullPercent ?? 0}
                    animated={pullPercent === undefined}
                    size="sm"
                  />
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>

      <style>{`
        .avatar-overlay { opacity: 0; }
        button:hover .avatar-overlay { opacity: 1; }
      `}</style>
    </>
  );
}
