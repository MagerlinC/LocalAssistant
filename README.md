# LocalAssistant

A local-first AI desktop assistant. Runs fully offline using Ollama — no cloud, no telemetry.

## Prerequisites

- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- [Rust](https://rustup.rs) (for Tauri)
- [Docker](https://www.docker.com) (for the dev backend)
- Ollama running locally at port `11434`

---

## Development

```bash
pnpm install
pnpm --filter @local-assistant/shared build

# Terminal 1 — backend (Docker)
docker compose --profile tauri up --build

# Terminal 2 — desktop window (hot reload)
pnpm --filter @local-assistant/desktop tauri dev
```

The app talks to the Dockerised backend at `http://localhost:3001`.

---

## Building a distributable app

The release build bundles the backend and Ollama as self-contained sidecars.

### 1. Build the backend binary

```bash
pnpm build:backend-binary        # current platform
pnpm build:backend-binary:all    # all platforms (macOS arm64/x64, Windows x64)
```

### 2. Download the Ollama binary

```bash
pnpm download:ollama             # current platform
pnpm download:ollama:all         # all platforms
```

### 3. Build the Tauri app

```bash
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
packages/backend/    Node.js tRPC server + RAG pipeline
packages/shared/     Shared TypeScript types
scripts/             Build helpers (download-ollama, etc.)
```
