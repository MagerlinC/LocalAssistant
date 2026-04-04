import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/schema';
import { hashFile, extractText, chunkText, scanDirectory } from '../lib/fileParser';
import { ollamaEmbed, vectorToBuffer, bufferToVector, cosineSimilarity } from '../lib/ollama';
import type { FileRecord } from '@local-assistant/shared';

const BASE_DIR = path.join(os.homedir(), 'LocalAssistant', 'chats');

export function getChatFilesDir(chatId: string): string {
  return path.join(BASE_DIR, chatId, 'files');
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
): Promise<{ indexed: number; skipped: number }> {
  const db = getDb();
  const filesDir = getChatFilesDir(chatId);
  ensureChatDir(chatId);

  const diskFiles = scanDirectory(filesDir);
  let indexed = 0;
  let skipped = 0;
  let processed = 0;

  for (const filePath of diskFiles) {
    processed++;
    onProgress?.({ filesProcessed: processed, totalFiles: diskFiles.length, currentFile: path.basename(filePath) });

    const hash = hashFile(filePath);
    const existing = db
      .prepare(`SELECT id, hash FROM files WHERE chat_id = ? AND path = ?`)
      .get(chatId, filePath) as { id: string; hash: string } | undefined;

    if (existing && existing.hash === hash) {
      skipped++;
      continue;
    }

    try {
      const text = await extractText(filePath);
      const chunks = chunkText(text);

      // Remove old chunks and embeddings
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
        db.prepare(
          `UPDATE files SET hash = ?, last_indexed = datetime('now') WHERE id = ?`
        ).run(hash, existing.id);
      } else {
        const fileId = uuidv4();
        db.prepare(
          `INSERT INTO files (id, chat_id, path, hash) VALUES (?, ?, ?, ?)`
        ).run(fileId, chatId, filePath, hash);
      }

      const fileRow = db
        .prepare(`SELECT id FROM files WHERE chat_id = ? AND path = ?`)
        .get(chatId, filePath) as { id: string };

      const insertChunk = db.prepare(
        `INSERT INTO chunks (id, file_id, content, chunk_index) VALUES (?, ?, ?, ?)`
      );
      const insertEmbedding = db.prepare(
        `INSERT OR REPLACE INTO embeddings (id, chunk_id, vector) VALUES (?, ?, ?)`
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = uuidv4();
        insertChunk.run(chunkId, fileRow.id, chunks[i], i);

        const embedding = await ollamaEmbed(embedModel, chunks[i]);
        const vector = vectorToBuffer(embedding);
        insertEmbedding.run(uuidv4(), chunkId, vector);
      }

      indexed++;
    } catch (err) {
      console.error(`Failed to index ${filePath}:`, err);
    }
  }

  return { indexed, skipped };
}

export async function retrieveRelevantChunks(
  chatId: string,
  query: string,
  embedModel: string,
  topK = 5
): Promise<string[]> {
  const db = getDb();

  // Get all chunks for this chat
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
