import { useState, useRef } from 'react';
import {
  Box, Stack, Text, Button, TextInput, Avatar, Progress,
  Group, Select, UnstyledButton, Tooltip, ThemeIcon, Loader,
} from '@mantine/core';
import { IconRobot, IconCamera, IconBrain, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { trpc, trpcClient } from '../lib/trpc';
import { useApp } from '../context/AppContext';
import { DEFAULT_MODEL } from '@local-assistant/shared';

const DEFAULT_APP_NAME = 'LocalAssistant';

const SUGGESTED_MODELS = [
  { value: 'qwen2.5:7b',  label: 'Qwen 2.5 7B — recommended, fast & capable (~4.7 GB)' },
  { value: 'llama3.2:3b', label: 'Llama 3.2 3B — lightweight, quick (~2.0 GB)' },
  { value: 'llama3.1:8b', label: 'Llama 3.1 8B — well-rounded (~4.7 GB)' },
  { value: 'mistral:7b',  label: 'Mistral 7B — great for instructions (~4.1 GB)' },
  { value: 'phi4:14b',    label: 'Phi-4 14B — powerful, larger (~8.5 GB)' },
];

function resizeImageToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

type Step = 'identity' | 'model' | 'pulling' | 'done';

export default function SetupWizard() {
  const { setSetupComplete, setAppName, setAvatarUrl } = useApp();

  const [step, setStep] = useState<Step>('identity');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState('');
  const [pullStatus, setPullStatus] = useState('');
  const [pullPercent, setPullPercent] = useState<number | undefined>(undefined);
  const [pullError, setPullError] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const setAppSettings = trpc.chat.setAppSettings.useMutation();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await resizeImageToDataUrl(file, 128));
    } catch {
      notifications.show({ color: 'red', message: 'Failed to process image' });
    }
    e.target.value = '';
  }

  function handlePullModel() {
    const model = customModel.trim() || selectedModel;
    setPullStatus('Starting…');
    setPullPercent(undefined);
    setPullError('');
    setStep('pulling');

    trpcClient.chat.pullModel.subscribe(
      { model },
      {
        onData(event) {
          if (event.type === 'progress') {
            setPullStatus(event.status ?? '');
            setPullPercent(event.percent);
          } else if (event.type === 'done') {
            setPullPercent(100);
            setStep('done');
            setAppSettings.mutate(
              { appName: name.trim(), avatarDataUrl: avatar },
              {
                onSuccess: () => {
                  setAppName(name.trim());
                  setAvatarUrl(avatar);
                  utils.chat.getModels.invalidate();
                },
              }
            );
            setTimeout(() => setSetupComplete(true), 1200);
          } else if (event.type === 'error') {
            setPullError(event.error ?? 'Unknown error');
          }
        },
        onError(err) {
          setPullError(String(err));
        },
      }
    );
  }

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--la-bg-base, #0d0d14)',
      }}
    >
      <Box
        style={{
          width: '100%',
          maxWidth: 480,
          padding: '2rem',
          borderRadius: 'var(--mantine-radius-lg)',
          background: 'var(--la-panel-bg, rgba(20,20,30,0.95))',
          border: '1px solid var(--la-border, rgba(139,92,246,0.2))',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* ── identity ── */}
        {step === 'identity' && (
          <Stack gap="lg">
            <Group gap="sm">
              <ThemeIcon color="primary" variant="light" size="lg" radius="md">
                <IconBrain size={22} />
              </ThemeIcon>
              <Box>
                <Text fw={700} size="lg">Welcome to LocalAssistant</Text>
                <Text size="sm" c="dimmed">Let's personalise your AI assistant</Text>
              </Box>
            </Group>

            <Group align="flex-start" gap="md">
              <Box>
                <Text size="xs" c="dimmed" mb={6}>Avatar (optional)</Text>
                <Tooltip label="Click to upload">
                  <UnstyledButton onClick={() => avatarInputRef.current?.click()}>
                    <Box style={{ position: 'relative', display: 'inline-block' }}>
                      <Avatar src={avatar || null} size={64} radius="md" color="primary" variant="light">
                        <IconRobot size={32} />
                      </Avatar>
                      <Box
                        className="avatar-overlay"
                        style={{
                          position: 'absolute', inset: 0,
                          borderRadius: 'var(--mantine-radius-md)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.5)',
                          opacity: 0, transition: 'opacity 0.15s',
                        }}
                      >
                        <IconCamera size={20} color="white" />
                      </Box>
                    </Box>
                  </UnstyledButton>
                </Tooltip>
                <input ref={avatarInputRef} type="file" accept="image/*"
                  style={{ display: 'none' }} onChange={handleAvatarChange} />
              </Box>

              <TextInput flex={1} label="Assistant name"
                placeholder={DEFAULT_APP_NAME} value={name}
                onChange={(e) => setName(e.target.value)} />
            </Group>

            <Button fullWidth onClick={() => setStep('model')}>
              Continue
            </Button>
          </Stack>
        )}

        {/* ── model ── */}
        {step === 'model' && (
          <Stack gap="lg">
            <Box>
              <Text fw={700} size="lg">Choose a model</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Models run fully offline after the initial download.
                Larger models are more capable but need more RAM and disk space.
              </Text>
            </Box>

            <Select label="Recommended models" data={SUGGESTED_MODELS}
              value={selectedModel} onChange={(v) => v && setSelectedModel(v)} />

            <TextInput label="Or enter a custom model name"
              placeholder="e.g. llama3.2:3b" value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              description="Any model from ollama.com/library" />

            <Group>
              <Button variant="subtle" onClick={() => setStep('identity')}>Back</Button>
              <Button flex={1} onClick={handlePullModel}
                disabled={!selectedModel && !customModel.trim()}>
                Download &amp; Start
              </Button>
            </Group>
          </Stack>
        )}

        {/* ── pulling ── */}
        {step === 'pulling' && (
          <Stack gap="lg" align="center">
            <Loader size="lg" color="primary" />
            <Box ta="center">
              <Text fw={600} size="lg">Downloading model</Text>
              <Text size="sm" c="dimmed" mt={4}>
                This may take a few minutes. The model is saved locally
                and won't need downloading again.
              </Text>
            </Box>
            {pullStatus && (
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                {pullStatus}
              </Text>
            )}
            <Progress value={pullPercent ?? 0} animated={pullPercent === undefined}
              size="md" w="100%" color="primary" />
            {pullError && (
              <Stack gap="xs" w="100%">
                <Text size="sm" c="red">{pullError}</Text>
                <Button variant="light" color="red" onClick={() => setStep('model')}>
                  Go back
                </Button>
              </Stack>
            )}
          </Stack>
        )}

        {/* ── done ── */}
        {step === 'done' && (
          <Stack gap="lg" align="center">
            <ThemeIcon color="green" variant="light" size={64} radius="xl">
              <IconCheck size={36} />
            </ThemeIcon>
            <Box ta="center">
              <Text fw={700} size="xl">All set!</Text>
              <Text size="sm" c="dimmed" mt={4}>Your assistant is ready. Starting…</Text>
            </Box>
          </Stack>
        )}
      </Box>

      <style>{`
        .avatar-overlay { opacity: 0; }
        button:hover .avatar-overlay { opacity: 1; }
      `}</style>
    </Box>
  );
}
