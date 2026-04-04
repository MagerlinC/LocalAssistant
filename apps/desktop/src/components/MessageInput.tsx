import { useState, useRef, KeyboardEvent } from 'react';
import { Group, Textarea, ActionIcon, Tooltip, Text, Box } from '@mantine/core';
import { IconSend, IconPlayerStop } from '@tabler/icons-react';
import { trpc, trpcClient } from '../lib/trpc';
import { useApp } from '../context/AppContext';

interface MessageInputProps {
  chatId: string;
  onStreamingChange: (content: string | null) => void;
}

export default function MessageInput({ chatId, onStreamingChange }: MessageInputProps) {
  const [input, setInput] = useState('');
  const { isStreaming, setIsStreaming, setIndexingStatus } = useApp();
  const utils = trpc.useUtils();
  const unsubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const streamingRef = useRef('');

  function handleSend() {
    const content = input.trim();
    if (!content || isStreaming) return;

    setInput('');
    setIsStreaming(true);
    streamingRef.current = '';
    onStreamingChange('');

    const subscription = trpcClient.chat.sendMessage.subscribe(
      { chatId, content },
      {
        onData(event: { type: string; content?: string; error?: string }) {
          if (event.type === 'indexing') {
            setIndexingStatus(event.content ?? 'Indexing...');
          } else if (event.type === 'text') {
            setIndexingStatus(null);
            streamingRef.current += event.content ?? '';
            onStreamingChange(streamingRef.current);
          } else if (event.type === 'done') {
            onStreamingChange(null);
            setIsStreaming(false);
            setIndexingStatus(null);
            streamingRef.current = '';
            utils.chat.getMessages.invalidate({ chatId });
          } else if (event.type === 'error') {
            onStreamingChange(null);
            setIsStreaming(false);
            setIndexingStatus(null);
            streamingRef.current = '';
            console.error('Stream error:', event.error);
          }
        },
        onError(err: unknown) {
          onStreamingChange(null);
          setIsStreaming(false);
          setIndexingStatus(null);
          console.error('Subscription error:', err);
        },
        onComplete() {
          onStreamingChange(null);
          setIsStreaming(false);
          setIndexingStatus(null);
        },
      }
    );

    unsubRef.current = subscription;
  }

  function handleAbort() {
    unsubRef.current?.unsubscribe();
    unsubRef.current = null;
    onStreamingChange(null);
    setIsStreaming(false);
    setIndexingStatus(null);
    streamingRef.current = '';
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Box p="md">
      <Group align="flex-end" gap="xs">
        <Textarea
          flex={1}
          placeholder="Message... (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          minRows={1}
          maxRows={6}
          autosize
          radius="md"
        />
        {isStreaming ? (
          <Tooltip label="Stop generating">
            <ActionIcon size="lg" color="red" variant="light" onClick={handleAbort}>
              <IconPlayerStop size={18} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Send (Enter)">
            <ActionIcon
              size="lg"
              color="violet"
              variant="filled"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <IconSend size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        Files in the Files tab will be indexed before each message
      </Text>
    </Box>
  );
}
