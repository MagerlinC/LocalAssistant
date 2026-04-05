// Writes to stderr so output is never buffered in Docker / non-TTY environments.
// docker compose logs will show these immediately.
function fmt(level: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const suffix = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${msg}${suffix}\n`;
}

export const log = {
  info:  (msg: string, meta?: unknown) => process.stderr.write(fmt('INFO ', msg, meta)),
  warn:  (msg: string, meta?: unknown) => process.stderr.write(fmt('WARN ', msg, meta)),
  error: (msg: string, meta?: unknown) => process.stderr.write(fmt('ERROR', msg, meta)),
};
