import { useState } from 'react';
import { Box, Group, Text, Divider, Tabs, Badge } from '@mantine/core';
import { IconMessage, IconFolder, IconSettings } from '@tabler/icons-react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import FilePanel from './FilePanel';
import ChatSettings from './ChatSettings';
import { trpc } from '../lib/trpc';
import { useApp } from '../context/AppContext';
import { useEffect } from 'react';

interface ChatViewProps {
  chatId: string;
}

export default function ChatView({ chatId }: ChatViewProps) {
  const { setCurrentChat } = useApp();
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  const { data: chat } = trpc.chat.getChat.useQuery({ chatId }, { enabled: !!chatId });
  const { data: files } = trpc.chat.getFiles.useQuery({ chatId }, { enabled: !!chatId });

  useEffect(() => {
    if (chat) setCurrentChat(chat);
  }, [chat, setCurrentChat]);

  if (!chat) return null;

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <Box flex={1}>
          <Text fw={600} size="sm" truncate>
            {chat.name}
          </Text>
          <Text size="xs" c="dimmed">
            {chat.model}
          </Text>
        </Box>
      </Group>

      <Tabs
        defaultValue="chat"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <Tabs.List px="md" style={{ flexShrink: 0 }}>
          <Tabs.Tab value="chat" leftSection={<IconMessage size={14} />}>
            Chat
          </Tabs.Tab>
          <Tabs.Tab
            value="files"
            leftSection={<IconFolder size={14} />}
            rightSection={
              files && files.length > 0 ? (
                <Badge size="xs" variant="filled" color="violet" circle>
                  {files.length}
                </Badge>
              ) : undefined
            }
          >
            Files
          </Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<IconSettings size={14} />}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel
          value="chat"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <MessageList chatId={chatId} streamingContent={streamingContent} pendingUserMessage={pendingUserMessage} />
          <Divider />
          <MessageInput chatId={chatId} onStreamingChange={setStreamingContent} onPendingMessage={setPendingUserMessage} />
        </Tabs.Panel>

        <Tabs.Panel value="files" style={{ overflow: 'auto', flex: 1 }}>
          <FilePanel chatId={chatId} />
        </Tabs.Panel>

        <Tabs.Panel value="settings" style={{ overflow: 'auto', flex: 1 }}>
          <ChatSettings chatId={chatId} chat={chat} />
        </Tabs.Panel>
      </Tabs>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </Box>
  );
}
