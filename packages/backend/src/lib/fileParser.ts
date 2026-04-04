import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv':
      return fs.readFileSync(filePath, 'utf-8');

    case '.pdf':
      return extractPdf(filePath);

    case '.docx':
      return extractDocx(filePath);

    case '.xlsx':
    case '.xls':
      return extractXlsx(filePath);

    case '.pptx':
      return extractPptx(filePath);

    default:
      // Try reading as plain text
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch {
        throw new Error(`Unsupported file type: ${ext}`);
      }
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractXlsx(filePath: string): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath);
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(`[Sheet: ${sheetName}]`);
    lines.push(csv);
  }

  return lines.join('\n');
}

async function extractPptx(filePath: string): Promise<string> {
  // Basic PPTX extraction using xml parsing
  const JSZip = (await import('jszip')).default;
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const texts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort();

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async('string');
    // Strip XML tags and extract text
    const text = content
      .replace(/<a:t>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) texts.push(text);
  }

  return texts.join('\n\n');
}

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk);
    i += chunkSize - overlap;
  }

  return chunks;
}

export function scanDirectory(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const SUPPORTED_EXTENSIONS = new Set([
    '.txt', '.md', '.csv', '.pdf', '.docx', '.xlsx', '.xls', '.pptx',
  ]);

  const results: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return results;
}
