# LocalAssistant

A local-first AI desktop/web assistant that analyzes office files using a locally running Ollama LLM.

## Prerequisites

- **Ollama** running on the host at port `11434`
- A model pulled, e.g.: `ollama pull qwen2.5:7b`

| Mode | Docker | pnpm | Rust |
|------|:------:|:----:|:----:|
| Web (browser) | ✅ required | — | — |
| Tauri (native window) | optional | ✅ required | ✅ required |
| Fully local | — | ✅ required | ✅ required |

> **Rust is only needed if you want a native desktop window.** Tauri compiles to a
> native binary for your OS — that step cannot happen inside a container.
> If you just want to run the app, use web mode.

---

## Running Modes

### 1. Web mode — fully containerised, no Rust needed

Everything runs in Docker. Open your browser, no Rust or pnpm install required.

```bash
docker compose --profile web up --build
# → open http://localhost:8080
```

To change the port: `WEB_PORT=3000 docker compose --profile web up`

---

### 2. Tauri desktop mode — native window (requires Rust locally)

The backend runs in Docker but the native window compiles and runs on your machine,
so **Rust must be installed locally**:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

Then:

```bash
# Terminal 1 — start the containerised backend
docker compose --profile tauri up --build

# Terminal 2 — compile and open the native desktop window
pnpm install
pnpm --filter @local-assistant/shared build
pnpm --filter @local-assistant/desktop tauri dev
```

---

### 3. Dev mode — hot reload, everything in Docker

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  --profile web up --build
# → open http://localhost:1420
```

Backend (tsx watch) and frontend (Vite HMR) both reload on file changes
because the source directories are volume-mounted into the containers.

---

### 4. Fully local (no Docker)

```bash
pnpm install
pnpm --filter @local-assistant/shared build

# Terminal 1
pnpm --filter @local-assistant/backend dev

# Terminal 2
pnpm --filter @local-assistant/desktop dev   # browser at http://localhost:1420
# or
pnpm --filter @local-assistant/desktop tauri dev   # native window
```

---

## Ollama on Linux

`host.docker.internal` is not available by default on Linux. Either:

```bash
# Option A — .env file
echo "OLLAMA_URL=http://172.17.0.1:11434" > .env

# Option B — expose Ollama on all interfaces
OLLAMA_HOST=0.0.0.0 ollama serve
```

---

## Data Storage

| Path | Contents |
|------|----------|
| `~/LocalAssistant/local-assistant.db` | SQLite database |
| `~/LocalAssistant/chats/{chatId}/files/` | Drop files here to index them |

The Docker backend mounts `~/LocalAssistant` from the host, so data persists
between container restarts and is shared with the Tauri app.

---

## File Support

`.pdf` · `.docx` · `.xlsx` / `.xls` · `.pptx` · `.txt` · `.md` · `.csv`

---

## Architecture

```
docker-compose.yml          production compose (profiles: web, tauri)
docker-compose.dev.yml      dev overrides (hot reload)
Dockerfile.backend          production backend image
Dockerfile.backend.dev      dev backend image (tsx watch)
Dockerfile.web              nginx + built React app
Dockerfile.web.dev          Vite dev server
docker/nginx.conf           nginx: SPA + /trpc proxy + WS upgrade

apps/desktop/               Tauri shell + React/Mantine frontend
packages/backend/           Node.js tRPC server + RAG pipeline
packages/shared/            Shared TypeScript types (dual CJS/ESM)
```

**Data flow in web mode:**

```
Browser → nginx :80 → /trpc → backend :3001 → SQLite + Ollama
                    ↗ WebSocket upgrade (streaming)
```

**Data flow in Tauri mode:**

```
Tauri window → backend :3001 (Docker) → SQLite + Ollama
```
