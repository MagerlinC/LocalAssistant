import { useEffect, useRef } from 'react';
import { Box, Stack, Text, Paper, Group, Avatar, ScrollArea, Button, Alert } from '@mantine/core';
import { IconRobot, IconUser, IconPresentation, IconCopy, IconFolderOpen } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { open as shellOpen } from '@tauri-apps/api/shell';
import { trpc } from '../lib/trpc';
import { useApp } from '../context/AppContext';
import type { Message } from '@local-assistant/shared';

interface MessageListProps {
  chatId: string;
  streamingContent: string | null;
  pendingUserMessage: string | null;
  presentationPath?: string | null;
}

async function openWithShell(path: string) {
  // Remote URLs pass through as-is; local paths must be file:// URLs
  const url = /^(https?|mailto|tel):/.test(path) ? path : `file://${path}`;
  await shellOpen(url);
}

function dirOf(filePath: string) {
  const sep = filePath.includes('/') ? '/' : '\\';
  return filePath.substring(0, filePath.lastIndexOf(sep)) || sep;
}

export default function MessageList({ chatId, streamingContent, pendingUserMessage, presentationPath }: MessageListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const { avatarUrl, appName } = useApp();

  const { data: messages } = trpc.chat.getMessages.useQuery({ chatId });

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamingContent, presentationPath]);

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
        {pendingUserMessage !== null && (
          <MessageBubble role="user" content={pendingUserMessage} avatarUrl={avatarUrl} />
        )}
        {streamingContent !== null && (
          streamingContent === ''
            ? <ThinkingBubble name={appName} avatarUrl={avatarUrl} />
            : <MessageBubble role="assistant" content={streamingContent} isStreaming avatarUrl={avatarUrl} />
        )}
        {presentationPath && (
          <Group justify="flex-start" gap="sm">
            <Box style={{ width: 28 }} /> {/* avatar placeholder to align with assistant bubbles */}
            <Alert
              icon={<IconPresentation size={16} />}
              title="Presentation ready"
              color="green"
              variant="light"
              style={{ maxWidth: '75%' }}
            >
              <Text size="xs" c="dimmed" mb="xs" style={{ wordBreak: 'break-all' }}>
                {presentationPath}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  leftSection={<IconPresentation size={14} />}
                  onClick={() => openWithShell(presentationPath)}
                >
                  Open presentation
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconFolderOpen size={14} />}
                  onClick={() => openWithShell(dirOf(presentationPath))}
                >
                  Show in folder
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<IconCopy size={14} />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(presentationPath);
                    notifications.show({ message: 'Path copied to clipboard', color: 'blue' });
                  }}
                >
                  Copy path
                </Button>
              </Group>
            </Alert>
          </Group>
        )}
      </Stack>
    </ScrollArea>
  );
}

function ThinkingBubble({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <>
      <style>{`
        @keyframes la-thinking-dot {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .la-thinking-dot {
          animation: la-thinking-dot 1.2s ease-in-out infinite;
          opacity: 0.2;
        }
      `}</style>
      <Group align="flex-start" justify="flex-start" gap="sm">
        <Avatar src={avatarUrl || null} size="sm" color="primary" variant="light" radius="sm">
          <IconRobot size={14} />
        </Avatar>
        <Paper p="sm" radius="lg" className="la-bubble-assistant">
          <Box style={{ fontSize: 14, lineHeight: 1.6 }}>
            <Text component="span" c="dimmed" size="sm">
              {name || 'Assistant'} is thinking
              <span className="la-thinking-dot" style={{ animationDelay: '0ms' }}>.</span>
              <span className="la-thinking-dot" style={{ animationDelay: '200ms' }}>.</span>
              <span className="la-thinking-dot" style={{ animationDelay: '400ms' }}>.</span>
            </Text>
          </Box>
        </Paper>
      </Group>
    </>
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
        <Avatar src={avatarUrl || null} size="sm" color="primary" variant="light" radius="sm">
          <IconRobot size={14} />
        </Avatar>
      )}
      <Paper
        p="sm"
        maw="75%"
        radius="lg"
        className={isUser ? 'la-bubble-user' : 'la-bubble-assistant'}
      >
        <Box style={{ fontSize: 14, lineHeight: 1.6 }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (href) openWithShell(href);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {children}
                  </a>
                );
              },
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
