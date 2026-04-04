import { useState } from 'react';
import { Stack, Text, Textarea, Button, Group, Select, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { trpc } from '../lib/trpc';
import type { Chat } from '@local-assistant/shared';
import { DEFAULT_SYSTEM_PROMPT } from '@local-assistant/shared';

interface ChatSettingsProps {
  chatId: string;
  chat: Chat;
}

export default function ChatSettings({ chatId, chat }: ChatSettingsProps) {
  const [name, setName] = useState(chat.name);
  const [systemPrompt, setSystemPrompt] = useState(chat.systemPromptOverride ?? '');
  const utils = trpc.useUtils();

  const { data: models } = trpc.chat.getModels.useQuery();
  const { data: defaultPrompt } = trpc.chat.getDefaultSystemPrompt.useQuery();

  const updateChat = trpc.chat.updateChat.useMutation({
    onSuccess: () => {
      notifications.show({ color: 'green', message: 'Chat settings saved' });
      utils.chat.getChat.invalidate({ chatId });
      utils.chat.getChats.invalidate();
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const hasMessages = trpc.chat.getMessages.useQuery({ chatId });
  const modelLocked = (hasMessages.data?.length ?? 0) > 0;

  return (
    <Stack p="md" gap="md">
      <Text fw={600}>Chat Settings</Text>

      <TextInput
        label="Chat name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {modelLocked ? (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Model
          </Text>
          <Text size="sm" c="dimmed">
            {chat.model} (locked after first message)
          </Text>
        </Stack>
      ) : (
        <Select
          label="Model"
          description="Can only be changed before first message"
          data={models?.map((m) => ({ value: m.name, label: m.name })) ?? []}
          value={chat.model}
          disabled
        />
      )}

      <Textarea
        label="System prompt override"
        description={`Leave empty to use the global default. Default: "${(defaultPrompt ?? DEFAULT_SYSTEM_PROMPT).slice(0, 80)}..."`}
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder={defaultPrompt ?? DEFAULT_SYSTEM_PROMPT}
        minRows={5}
        autosize
      />

      <Group>
        <Button
          onClick={() =>
            updateChat.mutate({
              chatId,
              name,
              systemPromptOverride: systemPrompt || null,
            })
          }
          loading={updateChat.isPending}
        >
          Save
        </Button>
        {systemPrompt && (
          <Button variant="subtle" color="red" onClick={() => setSystemPrompt('')}>
            Clear override
          </Button>
        )}
      </Group>
    </Stack>
  );
}
