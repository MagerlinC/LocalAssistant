import { useEffect, useRef } from 'react';
import { Box, Stack, Text, Paper, Group, Avatar, ScrollArea } from '@mantine/core';
import { IconRobot, IconUser } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { trpc } from '../lib/trpc';
import { useApp } from '../context/AppContext';
import type { Message } from '@local-assistant/shared';

interface MessageListProps {
  chatId: string;
  streamingContent: string | null;
}

export default function MessageList({ chatId, streamingContent }: MessageListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const { avatarUrl } = useApp();

  const { data: messages } = trpc.chat.getMessages.useQuery({ chatId });

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  return (
    <ScrollArea flex={1} viewportRef={viewport} p="md">
      <Stack gap="md">
        {(!messages || messages.length === 0) && !streamingContent && (
          <Text c="dimmed" ta="center" mt="xl">
            Start a conversation. Drop files in the Files tab to analyze them.
          </Text>
        )}
        {messages?.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} avatarUrl={avatarUrl} />
        ))}
        {streamingContent !== null && (
          <MessageBubble role="assistant" content={streamingContent} isStreaming avatarUrl={avatarUrl} />
        )}
      </Stack>
    </ScrollArea>
  );
}

interface MessageBubbleProps {
  role: string;
  content: string;
  isStreaming?: boolean;
  avatarUrl?: string;
}

function MessageBubble({ role, content, isStreaming, avatarUrl }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <Group align="flex-start" justify={isUser ? 'flex-end' : 'flex-start'} gap="sm">
      {!isUser && (
        <Avatar src={avatarUrl || null} size="sm" color="violet" variant="light" radius="sm">
          <IconRobot size={14} />
        </Avatar>
      )}
      <Paper
        p="sm"
        maw="75%"
        radius="md"
        style={isUser ? undefined : {
          background: 'var(--la-panel-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--la-border)',
        }}
        bg={isUser ? 'violet.9' : undefined}
      >
        <Box style={{ fontSize: 14, lineHeight: 1.6, color: isUser ? 'white' : undefined }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      padding: '1px 4px',
                      borderRadius: 3,
                      fontSize: 13,
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {content || ' '}
          </ReactMarkdown>
          {isStreaming && (
            <Box
              component="span"
              style={{
                display: 'inline-block',
                width: 8,
                height: 14,
                backgroundColor: 'currentColor',
                marginLeft: 2,
                animation: 'blink 1s step-end infinite',
              }}
            />
          )}
        </Box>
      </Paper>
      {isUser && (
        <Avatar size="sm" color="gray" variant="light">
          <IconUser size={14} />
        </Avatar>
      )}
    </Group>
  );
}
