const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function ollamaChat(
  model: string,
  messages: OllamaChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama chat error: ${response.status} ${err}`);
  }

  if (!response.body) throw new Error('No response body from Ollama');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          onChunk(json.message.content);
        }
        if (json.done) return;
      } catch {
        // ignore parse errors for partial lines
      }
    }
  }
}

export async function ollamaEmbed(
  model: string,
  text: string
): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama embed error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as { embedding: number[] };
  return data.embedding;
}

export async function ollamaListModels(): Promise<
  Array<{ name: string; size: number; digest: string; modified_at: string }>
> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama list models error: ${response.status}`);
  }
  const data = (await response.json()) as {
    models: Array<{
      name: string;
      size: number;
      digest: string;
      modified_at: string;
    }>;
  };
  return data.models ?? [];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorToBuffer(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i], i * 4);
  }
  return buf;
}

export function bufferToVector(buf: Buffer): number[] {
  const count = buf.length / 4;
  const vec: number[] = [];
  for (let i = 0; i < count; i++) {
    vec.push(buf.readFloatLE(i * 4));
  }
  return vec;
}
