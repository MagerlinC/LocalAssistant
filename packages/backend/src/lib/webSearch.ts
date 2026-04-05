import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const SEARXNG_BASE = process.env.SEARXNG_URL ?? 'http://localhost:8080';
const MAX_RESULTS = 5;
const MAX_CONTENT_CHARS = 3000;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const UA = 'LocalAssistant/1.0 (local research tool; +https://github.com/local-assistant)';

export type WebSearchResult = {
  title: string;
  url: string;
  snippet?: string;
  content: string;
};

// ── In-memory result cache ────────────────────────────────────────────────────
interface CacheEntry {
  results: WebSearchResult[];
  ts: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(query: string): WebSearchResult[] | null {
  const entry = cache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(query);
    return null;
  }
  return entry.results;
}

function setCached(query: string, results: WebSearchResult[]): void {
  cache.set(query, { results, ts: Date.now() });
}

// ── SearXNG query ─────────────────────────────────────────────────────────────
interface SearXNGResult {
  title: string;
  url: string;
  content?: string;
}

async function querySearchEngine(query: string): Promise<SearXNGResult[]> {
  const url = new URL('/search', SEARXNG_BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
    const data = (await res.json()) as { results?: SearXNGResult[] };
    return data.results ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── Page fetching + Readability extraction ────────────────────────────────────
async function fetchPageContent(pageUrl: string): Promise<string> {
  // Skip non-HTML targets
  if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|mp4|mp3)(\?|$)/i.test(pageUrl)) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) return '';

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return '';

    const html = await res.text();
    const dom = new JSDOM(html, { url: pageUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article?.textContent) return '';

    // Normalise whitespace and truncate
    return article.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CONTENT_CHARS);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

// ── Domain deduplication helper ───────────────────────────────────────────────
function domain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function webSearch(query: string): Promise<WebSearchResult[]> {
  const cached = getCached(query);
  if (cached) return cached;

  const raw = await querySearchEngine(query);

  // Deduplicate by domain, keep MAX_RESULTS
  const seen = new Set<string>();
  const candidates = raw.filter((r) => {
    const d = domain(r.url);
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  }).slice(0, MAX_RESULTS);

  // Fetch pages in parallel, skip failures
  const results: WebSearchResult[] = await Promise.all(
    candidates.map(async (r): Promise<WebSearchResult> => {
      const content = await fetchPageContent(r.url);
      return {
        title: r.title,
        url: r.url,
        snippet: r.content,
        content: content || r.content || '',
      };
    })
  );

  // Drop empty results
  const final = results.filter((r) => r.content.length > 0);

  setCached(query, final);
  return final;
}
