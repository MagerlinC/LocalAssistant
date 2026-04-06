import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/schema';
import { hashFile, extractText, chunkText, scanDirectory } from '../lib/fileParser';
import { ollamaEmbed, vectorToBuffer, bufferToVector, cosineSimilarity } from '../lib/ollama';
import { log } from '../lib/logger';
import type { FileRecord } from '@local-assistant/shared';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function getBaseDir(): string {
  if (process.env.DATA_DIR) return path.join(process.env.DATA_DIR, 'chats');

  if (process.platform === 'darwin') {
    const user = process.env.USER || process.env.LOGNAME;
    if (user) {
      return path.join('/Users', user, 'Library', 'Application Support', 'com.localassistant.app', 'chats');
    }
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'com.localassistant.app', 'chats');
  }

  return path.join(os.homedir(), 'LocalAssistant', 'chats');
}

export function getChatFilesDir(chatId: string): string {
  return path.join(getBaseDir(), chatId, 'files');
}

export function ensureChatDir(chatId: string): void {
  fs.mkdirSync(getChatFilesDir(chatId), { recursive: true });
}

interface DbFile {
  id: string;
  chat_id: string;
  path: string;
  hash: string;
  last_indexed: string;
}

function mapFile(row: DbFile): FileRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    path: row.path,
    hash: row.hash,
    lastIndexed: row.last_indexed,
  };
}

export function deleteFile(fileId: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT path FROM files WHERE id = ?`).get(fileId) as { path: string } | undefined;
  if (!row) throw new Error(`File not found: ${fileId}`);
  // Remove from disk (ignore if already gone)
  try { fs.unlinkSync(row.path); } catch {}
  // Cascade deletes chunks + embeddings via FK constraints
  db.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);
}

export function getFiles(chatId: string): FileRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM files WHERE chat_id = ? ORDER BY last_indexed DESC`)
    .all(chatId) as DbFile[];
  return rows.map(mapFile);
}

export type IndexingProgressCallback = (progress: {
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
}) => void;

export async function indexChatFiles(
  chatId: string,
  embedModel: string,
  onProgress?: IndexingProgressCallback
): Promise<{ indexed: number; skipped: number; errors: string[]; filesDir: string }> {
  const db = getDb();
  const filesDir = getChatFilesDir(chatId);
  ensureChatDir(chatId);

  const diskFiles = scanDirectory(filesDir);
  log.info(`Indexing chat ${chatId}: found ${diskFiles.length} file(s) in ${filesDir}`);

  let indexed = 0;
  let skipped = 0;
  let processed = 0;
  const errors: string[] = [];

  for (const filePath of diskFiles) {
    processed++;
    const fileName = path.basename(filePath);
    onProgress?.({ filesProcessed: processed, totalFiles: diskFiles.length, currentFile: fileName });

    const hash = hashFile(filePath);
    const existing = db
      .prepare(`SELECT id, hash FROM files WHERE chat_id = ? AND path = ?`)
      .get(chatId, filePath) as { id: string; hash: string } | undefined;

    if (existing && existing.hash === hash) {
      log.info(`Skipping unchanged file: ${fileName}`);
      skipped++;
      continue;
    }

    // Always record the file in the DB first, before parsing or embedding.
    // This way it appears in the file list even if embedding fails.
    let fileId: string;
    if (existing) {
      const chunkIds = (
        db.prepare(`SELECT id FROM chunks WHERE file_id = ?`).all(existing.id) as { id: string }[]
      ).map((r) => r.id);
      if (chunkIds.length > 0) {
        db.prepare(
          `DELETE FROM embeddings WHERE chunk_id IN (${chunkIds.map(() => '?').join(',')})`
        ).run(...chunkIds);
      }
      db.prepare(`DELETE FROM chunks WHERE file_id = ?`).run(existing.id);
      db.prepare(`UPDATE files SET hash = ?, last_indexed = datetime('now') WHERE id = ?`).run(hash, existing.id);
      fileId = existing.id;
    } else {
      fileId = uuidv4();
      db.prepare(`INSERT INTO files (id, chat_id, path, hash) VALUES (?, ?, ?, ?)`)
        .run(fileId, chatId, filePath, hash);
    }

    // Parse text
    let chunks: string[];
    try {
      log.info(`Extracting text from: ${fileName}`);
      const text = await withTimeout(extractText(filePath), 30_000, `extractText(${fileName})`);
      chunks = chunkText(text);
      log.info(`Extracted ${chunks.length} chunk(s) from: ${fileName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to extract text from ${fileName}: ${msg}`);
      errors.push(`${fileName}: extraction failed — ${msg}`);
      continue;
    }

    // Embed chunks
    const insertChunk = db.prepare(
      `INSERT INTO chunks (id, file_id, content, chunk_index) VALUES (?, ?, ?, ?)`
    );
    const insertEmbedding = db.prepare(
      `INSERT OR REPLACE INTO embeddings (id, chunk_id, vector) VALUES (?, ?, ?)`
    );

    let embeddingFailed = false;
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = uuidv4();
      insertChunk.run(chunkId, fileId, chunks[i], i);

      try {
        const embedding = await ollamaEmbed(embedModel, chunks[i]);
        insertEmbedding.run(uuidv4(), chunkId, embedding.length > 0 ? vectorToBuffer(embedding) : Buffer.alloc(0));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Embedding failed for chunk ${i} of ${fileName}: ${msg}`);
        if (!embeddingFailed) {
          errors.push(`${fileName}: embedding failed — ${msg}`);
          embeddingFailed = true;
        }
        // Continue without embeddings — file is still indexed for display,
        // just won't be used for RAG retrieval.
        break;
      }
    }

    indexed++;
    log.info(`Indexed ${fileName} (embedding ${embeddingFailed ? 'failed — RAG disabled for this file' : 'OK'})`);
  }

  log.info(`Indexing complete: ${indexed} indexed, ${skipped} skipped, ${errors.length} error(s)`);
  return { indexed, skipped, errors, filesDir };
}

export async function retrieveRelevantChunks(
  chatId: string,
  query: string,
  embedModel: string,
  topK = 5
): Promise<string[]> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT c.content, e.vector
    FROM chunks c
    JOIN embeddings e ON e.chunk_id = c.id
    JOIN files f ON f.id = c.file_id
    WHERE f.chat_id = ?
  `).all(chatId) as { content: string; vector: Buffer }[];

  if (rows.length === 0) return [];

  const queryVec = await ollamaEmbed(embedModel, query);

  const scored = rows.map((row) => ({
    content: row.content,
    score: cosineSimilarity(queryVec, bufferToVector(row.vector)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((r) => r.content);
}

export function hasIndexedFiles(chatId: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM chunks c
    JOIN files f ON f.id = c.file_id
    WHERE f.chat_id = ?
  `).get(chatId) as { count: number };
  return row.count > 0;
}
