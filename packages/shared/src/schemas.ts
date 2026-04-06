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

export const PresentationSlideSchema = z.object({
  title: z.string(),
  bullets: z.array(z.string()).max(5),
  notes: z.string().optional(),
});

export const PresentationInputSchema = z.object({
  title: z.string(),
  slides: z.array(PresentationSlideSchema).min(1),
});

export type PresentationInput = z.infer<typeof PresentationInputSchema>;

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful offline AI assistant that helps analyze documents, emails, and office files. Be concise, accurate, and professional.

PRESENTATION GENERATION:
If the user asks for a presentation, asks to "summarize into slides", or the conversation clearly leads to a presentation output:
1. Generate structured slide data and call the \`create_presentation\` tool — do NOT return slides as plain text.
2. After the tool returns, tell the user their presentation is ready. Do NOT include the file path, do NOT generate a download link or any link — the UI handles opening the file.

Slide generation rules:
- Max 5 slides unless explicitly asked for more
- Max 5 bullets per slide
- Each bullet must be ≤ 10 words
- No paragraphs — bullets only
- Professional tone
- For long conversations: summarize key points first, then convert to slides`;

export const DEFAULT_MODEL = 'qwen2.5:7b';
