import { z } from 'zod';

export const CreateChatSchema = z.object({
  name: z.string().min(1).max(255),
  model: z.string().min(1),
  systemPromptOverride: z.string().nullable().optional(),
});

export const SendMessageSchema = z.object({
  chatId: z.string(),
  content: z.string().min(1),
});

export const UpdateChatSchema = z.object({
  chatId: z.string(),
  name: z.string().min(1).max(255).optional(),
  systemPromptOverride: z.string().nullable().optional(),
});

export const GetChatSchema = z.object({
  chatId: z.string(),
});

export const DeleteChatSchema = z.object({
  chatId: z.string(),
});

export const GetFilesSchema = z.object({
  chatId: z.string(),
});

export const GetMessagesSchema = z.object({
  chatId: z.string(),
});

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful offline AI assistant that helps analyze documents, emails, and office files. Be concise, accurate, and professional.';

export const DEFAULT_MODEL = 'qwen2.5:7b';
