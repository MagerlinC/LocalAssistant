import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

function getDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // Fallback for dev: ~/LocalAssistant
  return path.join(os.homedir(), 'LocalAssistant');
}

export function getDataDirPath(): string {
  return getDataDir();
}

const DATA_DIR = getDataDir();
const DB_PATH = path.join(DATA_DIR, 'local-assistant.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const opts: Database.Options = {};
  // When running as a pkg binary, the native binding is extracted to a temp dir.
  // The startup code in index.ts sets this env var before getDb() is first called.
  if (process.env.BETTER_SQLITE3_NATIVE_BINDING) {
    opts.nativeBinding = process.env.BETTER_SQLITE3_NATIVE_BINDING;
  }

  _db = new Database(DB_PATH, opts);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt_override TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      hash TEXT NOT NULL,
      last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, path)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE UNIQUE,
      vector BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_files_chat_id ON files(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
  `);
}

// Keep the old export name for backwards compat
export const DATA_DIR_PATH = DATA_DIR;
