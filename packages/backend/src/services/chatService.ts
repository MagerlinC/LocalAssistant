import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/schema';
import type { Chat, Message } from '@local-assistant/shared';
import { DEFAULT_MODEL } from '@local-assistant/shared';

interface DbChat {
  id: string;
  name: string;
  model: string;
  system_prompt_override: string | null;
  created_at: string;
}

interface DbMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: string;
}

function mapChat(row: DbChat): Chat {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    systemPromptOverride: row.system_prompt_override,
    createdAt: row.created_at,
  };
}

function mapMessage(row: DbMessage): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role as Message['role'],
    content: row.content,
    createdAt: row.created_at,
  };
}

export function createChat(
  name: string,
  model: string = DEFAULT_MODEL,
  systemPromptOverride?: string | null
): Chat {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO chats (id, name, model, system_prompt_override) VALUES (?, ?, ?, ?)`
  ).run(id, name, model, systemPromptOverride ?? null);

  return getChat(id)!;
}

export function getChats(): Chat[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM chats ORDER BY created_at DESC`)
    .all() as DbChat[];
  return rows.map(mapChat);
}

export function getChat(chatId: string): Chat | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM chats WHERE id = ?`)
    .get(chatId) as DbChat | undefined;
  return row ? mapChat(row) : null;
}

export function updateChat(
  chatId: string,
  updates: { name?: string; systemPromptOverride?: string | null }
): Chat | null {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.systemPromptOverride !== undefined) {
    sets.push('system_prompt_override = ?');
    values.push(updates.systemPromptOverride);
  }

  if (sets.length === 0) return getChat(chatId);

  values.push(chatId);
  db.prepare(`UPDATE chats SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getChat(chatId);
}

export function deleteChat(chatId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM chats WHERE id = ?`).run(chatId);
}

export function saveMessage(
  chatId: string,
  role: Message['role'],
  content: string
): Message {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO messages (id, chat_id, role, content) VALUES (?, ?, ?, ?)`
  ).run(id, chatId, role, content);

  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as DbMessage;
  return mapMessage(row);
}

export function getMessages(chatId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
    .all(chatId) as DbMessage[];
  return rows.map(mapMessage);
}

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}
