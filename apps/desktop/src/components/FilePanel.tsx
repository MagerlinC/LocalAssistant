import { useState } from 'react';
import {
  Stack, Text, Button, Group, Badge, Card, ActionIcon,
  Tooltip, Loader, Box, Code, Progress,
} from '@mantine/core';
import { IconFile, IconRefresh, IconPlus, IconTrash } from '@tabler/icons-react';
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
  const deleteFile = trpc.chat.deleteFile.useMutation({
    onSuccess: () => {
      refetch();
      utils.chat.getFiles.invalidate({ chatId });
    },
    onError: (err) => {
      notifications.show({ color: 'red', title: 'Failed to remove file', message: err.message, autoClose: false });
    },
  });

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
              notifications.show({ color: 'red', title: 'Indexing failed', message: event.error ?? 'Unknown error', autoClose: false });
            } else {
              if (event.errors && event.errors.length > 0) {
                for (const msg of event.errors) {
                  notifications.show({ color: 'orange', title: 'File error', message: msg, autoClose: false });
                }
              }
              const indexed = event.indexed ?? 0;
              const skipped = event.skipped ?? 0;
              if (indexed === 0 && skipped === 0) {
                // Diagnostic: compare Tauri data dir vs backend data dir
                Promise.all([
                  isTauri
                    ? import('@tauri-apps/api/tauri').then(({ invoke }) => invoke<string>('get_data_dir'))
                    : Promise.resolve('(not Tauri)'),
                  trpcClient.chat.getBackendDataDir.query(),
                ]).then(([tauriDir, backendInfo]) => {
                  notifications.show({
                    color: 'yellow',
                    title: 'No files found — path diagnostic',
                    message: [
                      `Tauri dir: ${tauriDir}`,
                      `Backend DATA_DIR: ${backendInfo.dataDir}`,
                      `HOME: ${backendInfo.home}  USER: ${backendInfo.user}`,
                      `isPkg: ${backendInfo.isPkg}`,
                      `argv: ${backendInfo.argv}`,
                      `Scanned: ${backendInfo.chatsDirExample}`,
                    ].join('\n'),
                    autoClose: false,
                  });
                }).catch(() => {
                  notifications.show({
                    color: 'yellow',
                    title: 'No files found',
                    message: event.filesDir ?? 'Could not determine scan path',
                    autoClose: false,
                  });
                });
              }
            }
          }
        },
        onError(err) {
          setIndexing(false);
          setIsIndexing(false);
          setProgress(null);
          notifications.show({ color: 'red', title: 'Indexing failed', message: String(err), autoClose: false });
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
              <Tooltip label="Remove file">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  loading={deleteFile.isPending}
                  onClick={() => deleteFile.mutate({ fileId: file.id })}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
