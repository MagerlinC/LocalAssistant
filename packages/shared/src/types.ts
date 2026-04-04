export type MessageRole = 'user' | 'assistant' | 'system';

export interface Chat {
  id: string;
  name: string;
  model: string;
  systemPromptOverride: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  chatId: string;
  path: string;
  hash: string;
  lastIndexed: string;
}

export interface Chunk {
  id: string;
  fileId: string;
  content: string;
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface IndexingStatus {
  chatId: string;
  status: 'idle' | 'indexing' | 'done' | 'error';
  filesProcessed?: number;
  totalFiles?: number;
  error?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}
