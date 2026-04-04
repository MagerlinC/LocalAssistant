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
} from '@mantine/core';
import { IconPlus, IconTrash, IconSettings, IconMessage } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { trpc } from '../lib/trpc';
import { useApp } from '../context/AppContext';
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '@local-assistant/shared';

export default function Sidebar() {
  const { selectedChatId, setSelectedChatId, setCurrentChat } = useApp();
  const [newChatOpen, { open: openNewChat, close: closeNewChat }] = useDisclosure(false);
  const [settingsOpen, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatModel, setNewChatModel] = useState(DEFAULT_MODEL);
  const [defaultPrompt, setDefaultPrompt] = useState('');

  const utils = trpc.useUtils();

  const { data: chats, isLoading } = trpc.chat.getChats.useQuery();
  const { data: models } = trpc.chat.getModels.useQuery();
  const { data: savedDefaultPrompt } = trpc.chat.getDefaultSystemPrompt.useQuery();

  useEffect(() => {
    if (savedDefaultPrompt) setDefaultPrompt(savedDefaultPrompt);
  }, [savedDefaultPrompt]);

  const createChat = trpc.chat.createChat.useMutation({
    onSuccess: (chat) => {
      utils.chat.getChats.invalidate();
      setSelectedChatId(chat.id);
      setCurrentChat(chat);
      closeNewChat();
      setNewChatName('');
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const deleteChat = trpc.chat.deleteChat.useMutation({
    onSuccess: (_, vars) => {
      utils.chat.getChats.invalidate();
      if (selectedChatId === vars.chatId) {
        setSelectedChatId(null);
      }
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const setDefaultSystemPrompt = trpc.chat.setDefaultSystemPrompt.useMutation({
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Settings saved' });
      closeSettings();
    },
  });

  const modelOptions = models?.map((m) => ({ value: m.name, label: m.name })) ?? [
    { value: DEFAULT_MODEL, label: DEFAULT_MODEL },
  ];

  function handleCreateChat() {
    if (!newChatName.trim()) return;
    createChat.mutate({
      name: newChatName.trim(),
      model: newChatModel,
    });
  }

  function handleSelectChat(chatId: string) {
    const chat = chats?.find((c) => c.id === chatId);
    setSelectedChatId(chatId);
    if (chat) setCurrentChat(chat);
  }

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
          {chats?.map((chat) => (
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
          {!isLoading && chats?.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" p="md">
              No chats yet
            </Text>
          )}
        </ScrollArea>

        <Divider />
        <Group p="sm" justify="flex-end">
          <ActionIcon variant="subtle" onClick={openSettings} aria-label="Settings">
            <IconSettings size={18} />
          </ActionIcon>
        </Group>
      </Stack>

      {/* New Chat Modal */}
      <Modal opened={newChatOpen} onClose={closeNewChat} title="New Chat" centered>
        <Stack>
          <TextInput
            label="Chat name"
            placeholder="My analysis..."
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateChat()}
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
      <Modal opened={settingsOpen} onClose={closeSettings} title="Settings" centered size="lg">
        <Stack>
          <Textarea
            label="Default system prompt"
            description="Used for all new chats unless overridden"
            value={defaultPrompt}
            onChange={(e) => setDefaultPrompt(e.target.value)}
            minRows={6}
            autosize
          />
          <Button
            onClick={() => setDefaultSystemPrompt.mutate({ prompt: defaultPrompt })}
            loading={setDefaultSystemPrompt.isPending}
          >
            Save
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
