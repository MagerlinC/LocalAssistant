# LocalAssistant

A local-first AI desktop assistant. Runs fully offline using Ollama — no cloud, no telemetry.
Web search is powered by a local [SearXNG](https://docs.searxng.org) instance.

## Prerequisites

- [Node.js 22+](https://nodejs.org) + [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- [Rust](https://rustup.rs) (for Tauri)
- [Docker](https://www.docker.com)
- Ollama running locally at port `11434`

---

## Development

`docker compose up` starts the backend and SearXNG. The Tauri window runs locally with hot reload.

**One-time setup** (creates placeholder binaries so Tauri's build check passes in dev):

```bash
pnpm install
pnpm --filter @local-assistant/shared build
pnpm setup:dev
```

**Then, each dev session:**

```bash
# Terminal 1 — backend + SearXNG
docker compose up --build

# Terminal 2 — desktop window
pnpm --filter @local-assistant/desktop tauri dev
```

> **Linux:** if `host.docker.internal` isn't available, create a `.env` file:
> ```
> OLLAMA_URL=http://172.17.0.1:11434
> ```

---

## Building a distributable app

The release build bundles the backend and Ollama as self-contained sidecars.

```bash
# 1. Compile the backend to a native binary
pnpm build:backend-binary        # current platform
pnpm build:backend-binary:all    # all platforms (macOS arm64/x64, Windows x64)

# 2. Download the Ollama sidecar binary
pnpm download:ollama             # current platform
pnpm download:ollama:all         # all platforms

# 3. Build the Tauri installer
pnpm --filter @local-assistant/desktop tauri build
```

Or run all three steps at once:

```bash
pnpm build:dist
```

The output installer is written to `apps/desktop/src-tauri/target/release/bundle/`.

---

## Project layout

```
apps/desktop/        Tauri shell + React/Mantine frontend
packages/backend/    Node.js tRPC server + RAG pipeline + web search
packages/shared/     Shared TypeScript types
docker/              SearXNG config, nginx config
scripts/             Build helpers (download-ollama, etc.)
```
