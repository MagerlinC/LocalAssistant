import { Stack, Text, Button, Group, Badge, Card, ActionIcon, Tooltip, Loader, Box } from '@mantine/core';
import { IconFolder, IconFile, IconRefresh } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { open } from '@tauri-apps/api/shell';

interface FilePanelProps {
  chatId: string;
}

export default function FilePanel({ chatId }: FilePanelProps) {
  const utils = trpc.useUtils();

  const { data: files, isLoading, refetch } = trpc.chat.getFiles.useQuery({ chatId });
  const { data: dirInfo } = trpc.chat.getChatFilesDir.useQuery({ chatId });

  async function handleOpenFolder() {
    if (dirInfo?.path) {
      try {
        await open(dirInfo.path);
      } catch {
        // Fallback: show path
        alert(`Files folder: ${dirInfo.path}`);
      }
    }
  }

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Chat Files
        </Text>
        <Group gap="xs">
          <Tooltip label="Refresh file list">
            <ActionIcon variant="subtle" onClick={() => refetch()}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Button
            leftSection={<IconFolder size={14} />}
            variant="light"
            size="xs"
            onClick={handleOpenFolder}
          >
            Open Folder
          </Button>
        </Group>
      </Group>

      {dirInfo && (
        <Box
          p="xs"
          style={{
            background: 'var(--mantine-color-dark-7)',
            borderRadius: 6,
            fontFamily: 'monospace',
          }}
        >
          <Text size="xs" c="dimmed">
            {dirInfo.path}
          </Text>
        </Box>
      )}

      <Text size="xs" c="dimmed">
        Drop supported files (.pdf, .docx, .xlsx, .pptx, .txt, .md, .csv) into the folder above.
        They will be indexed automatically when you send a message.
      </Text>

      {isLoading && (
        <Group justify="center">
          <Loader size="sm" />
        </Group>
      )}

      {!isLoading && (!files || files.length === 0) && (
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
              <Badge size="xs" variant="light" color="green">
                indexed
              </Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
