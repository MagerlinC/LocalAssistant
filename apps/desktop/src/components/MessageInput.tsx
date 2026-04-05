import { useState, useRef, KeyboardEvent } from 'react';
import { Group, Textarea, ActionIcon, Tooltip, Text, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSend, IconPlayerStop } from '@tabler/icons-react';
import { trpc, trpcClient } from '../lib/trpc';
import { useApp } from '../context/AppContext';

interface MessageInputProps {
  chatId: string;
  onStreamingChange: (content: string | null) => void;
  onPendingMessage: (msg: string | null) => void;
  onPresentationReady?: (filePath: string) => void;
}

export default function MessageInput({ chatId, onStreamingChange, onPendingMessage, onPresentationReady }: MessageInputProps) {
  const [input, setInput] = useState('');
  const { isStreaming, setIsStreaming, isIndexing } = useApp();
  const utils = trpc.useUtils();
  const unsubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const streamingRef = useRef('');

  const blocked = isStreaming || isIndexing;

  function handleSend() {
    const content = input.trim();
    if (!content || blocked) return;

    setInput('');
    setIsStreaming(true);
    streamingRef.current = '';
    onStreamingChange('');
    onPendingMessage(content);

    const subscription = trpcClient.chat.sendMessage.subscribe(
      { chatId, content },
      {
        onData(event: { type: string; content?: string; error?: string; filePath?: string }) {
          if (event.type === 'file') {
            if (event.filePath) onPresentationReady?.(event.filePath);
          } else if (event.type === 'status') {
            // Show tool-use status only while no text has arrived yet
            if (!streamingRef.current) {
              onStreamingChange(`\u{1F50D} ${event.content ?? ''}…`);
            }
          } else if (event.type === 'text') {
            streamingRef.current += event.content ?? '';
            onStreamingChange(streamingRef.current);
          } else if (event.type === 'done') {
            onStreamingChange(null);
            onPendingMessage(null);
            setIsStreaming(false);
            streamingRef.current = '';
            utils.chat.getMessages.invalidate({ chatId });
          } else if (event.type === 'error') {
            onStreamingChange(null);
            onPendingMessage(null);
            setIsStreaming(false);
            streamingRef.current = '';
            utils.chat.getMessages.invalidate({ chatId });
            notifications.show({
              color: 'red',
              title: 'Error',
              message: event.error ?? 'Something went wrong',
            });
          }
        },
        onError(err: unknown) {
          onStreamingChange(null);
          onPendingMessage(null);
          setIsStreaming(false);
          utils.chat.getMessages.invalidate({ chatId });
          notifications.show({
            color: 'red',
            title: 'Connection error',
            message: err instanceof Error ? err.message : 'Lost connection to backend',
          });
        },
        onComplete() {
          onStreamingChange(null);
          onPendingMessage(null);
          setIsStreaming(false);
        },
      }
    );

    unsubRef.current = subscription;
  }

  function handleAbort() {
    unsubRef.current?.unsubscribe();
    unsubRef.current = null;
    onStreamingChange(null);
    onPendingMessage(null);
    setIsStreaming(false);
    streamingRef.current = '';
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Box p="md" className="la-input-area">
      <Group align="flex-end" gap="xs">
        <Textarea
          flex={1}
          placeholder={
            isIndexing
              ? 'Waiting for indexing to finish…'
              : 'Message… (Enter to send, Shift+Enter for newline)'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={blocked}
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
          <Tooltip label={isIndexing ? 'Indexing files…' : 'Send (Enter)'}>
            <ActionIcon
              size="lg"
              color="primary"
              variant="filled"
              onClick={handleSend}
              disabled={!input.trim() || blocked}
            >
              <IconSend size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {isIndexing && (
        <Text size="xs" c="yellow" mt={4}>
          Indexing files — chat will unlock when complete
        </Text>
      )}
    </Box>
  );
}
