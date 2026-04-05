const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

/**
 * Stream a chat completion from Ollama.
 *
 * When `tools` are provided, the model may respond with tool calls instead of
 * text. In that case `onChunk` is never called and the returned object carries
 * the `toolCalls` the model wants executed.
 */
export async function ollamaChat(
  model: string,
  messages: OllamaChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  tools?: OllamaTool[]
): Promise<{ toolCalls?: OllamaToolCall[] }> {
  const body: Record<string, unknown> = { model, messages, stream: true };
  if (tools && tools.length > 0) body.tools = tools;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama chat error: ${response.status} ${err}`);
  }

  if (!response.body) throw new Error('No response body from Ollama');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  // Ollama emits tool_calls in a done:false chunk, then a done:true chunk with
  // no message field. Accumulate across all chunks so we never miss them.
  let collectedToolCalls: OllamaToolCall[] | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line) as {
          message?: { content?: string; tool_calls?: OllamaToolCall[] };
          done?: boolean;
        };

        if (json.message?.tool_calls && json.message.tool_calls.length > 0) {
          collectedToolCalls = json.message.tool_calls;
        }

        if (json.message?.content) {
          onChunk(json.message.content);
        }

        if (json.done) {
          return collectedToolCalls ? { toolCalls: collectedToolCalls } : {};
        }
      } catch {
        // ignore parse errors for partial lines
      }
    }
  }

  return collectedToolCalls ? { toolCalls: collectedToolCalls } : {};
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

export async function ollamaPullModel(
  model: string,
  onProgress: (event: { status: string; percent?: number }) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama pull error: ${response.status} ${err}`);
  }

  if (!response.body) throw new Error('No response body from Ollama');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line) as { status: string; total?: number; completed?: number };
        const percent =
          json.total && json.completed
            ? Math.round((json.completed / json.total) * 100)
            : undefined;
        onProgress({ status: json.status, percent });
      } catch {
        // ignore partial lines
      }
    }
  }
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
