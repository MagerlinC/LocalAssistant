import { useState } from 'react';
import {
  Stack, Text, Button, Group, Badge, Card, ActionIcon,
  Tooltip, Loader, Box, Code, Progress,
} from '@mantine/core';
import { IconFile, IconRefresh, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { trpc, trpcClient } from '../lib/trpc';
import { useApp } from '../context/AppContext';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

async function pickAndCopyFiles(chatId: string): Promise<number> {
  const { open } = await import('@tauri-apps/api/dialog');
  const { invoke } = await import('@tauri-apps/api/tauri');

  const selected = await open({
    multiple: true,
    filters: [{
      name: 'Supported files',
      extensions: ['pdf', 'docx', 'xlsx', 'xls', 'pptx', 'txt', 'md', 'csv'],
    }],
  });

  if (!selected) return 0;
  const files = Array.isArray(selected) ? selected : [selected];
  if (files.length === 0) return 0;

  await invoke('copy_files_to_chat', { files, chatId });
  return files.length;
}

interface IndexingProgress {
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
}

interface FilePanelProps {
  chatId: string;
}

export default function FilePanel({ chatId }: FilePanelProps) {
  const { setIsIndexing } = useApp();
  const [copying, setCopying] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState<IndexingProgress | null>(null);
  const utils = trpc.useUtils();

  const { data: files, isLoading, refetch } = trpc.chat.getFiles.useQuery({ chatId });

  function startIndexing() {
    setIndexing(true);
    setIsIndexing(true);
    setProgress({ filesProcessed: 0, totalFiles: 0 });

    trpcClient.chat.indexFiles.subscribe(
      { chatId },
      {
        onData(event) {
          if (event.type === 'progress') {
            setProgress({
              filesProcessed: event.filesProcessed ?? 0,
              totalFiles: event.totalFiles ?? 0,
              currentFile: event.currentFile,
            });
          } else if (event.type === 'done' || event.type === 'error') {
            setIndexing(false);
            setIsIndexing(false);
            setProgress(null);
            refetch();
            utils.chat.getFiles.invalidate({ chatId });

            if (event.type === 'error') {
              notifications.show({ color: 'red', message: `Indexing failed: ${event.error}` });
            }
          }
        },
        onError() {
          setIndexing(false);
          setIsIndexing(false);
          setProgress(null);
        },
        onComplete() {
          setIndexing(false);
          setIsIndexing(false);
          setProgress(null);
        },
      }
    );
  }

  async function handleAddFiles() {
    setCopying(true);
    try {
      const count = await pickAndCopyFiles(chatId);
      if (count > 0) {
        startIndexing();
      }
    } catch (err) {
      notifications.show({ color: 'red', message: `Failed to add files: ${err}` });
    } finally {
      setCopying(false);
    }
  }

  const progressPercent =
    progress && progress.totalFiles > 0
      ? Math.round((progress.filesProcessed / progress.totalFiles) * 100)
      : undefined;

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">Chat Files</Text>
        <Group gap="xs">
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" onClick={() => refetch()} disabled={indexing}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          {isTauri && (
            <Button
              leftSection={<IconPlus size={14} />}
              variant="light"
              size="xs"
              onClick={handleAddFiles}
              loading={copying}
              disabled={indexing}
            >
              Add Files
            </Button>
          )}
        </Group>
      </Group>

      {indexing && (
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {progress?.currentFile
                ? `Indexing ${progress.currentFile}…`
                : 'Preparing…'}
            </Text>
            {progress && progress.totalFiles > 0 && (
              <Text size="xs" c="dimmed">
                {progress.filesProcessed} / {progress.totalFiles}
              </Text>
            )}
          </Group>
          <Progress
            value={progressPercent ?? 0}
            animated={progressPercent === undefined}
            size="sm"
          />
        </Stack>
      )}

      {!isTauri && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            Drop files into the chat folder, then send a message to index them.
          </Text>
          <Code block fz="xs">
            ~/LocalAssistant/chats/{chatId}/files/
          </Code>
        </Stack>
      )}

      {isLoading && <Group justify="center"><Loader size="sm" /></Group>}

      {!isLoading && (!files || files.length === 0) && !indexing && (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No files indexed yet
        </Text>
      )}

      <Stack gap="xs">
        {files?.map((file) => (
          <Card key={file.id} p="sm" withBorder>
            <Group gap="xs">
              <IconFile size={16} style={{ flexShrink: 0 }} />
              <Box flex={1} style={{ overflow: 'hidden' }}>
                <Text size="sm" truncate fw={500}>
                  {file.path.split('/').pop() ?? file.path}
                </Text>
                <Text size="xs" c="dimmed">
                  Indexed: {new Date(file.lastIndexed).toLocaleString()}
                </Text>
              </Box>
              <Badge size="xs" variant="light" color="green">indexed</Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
