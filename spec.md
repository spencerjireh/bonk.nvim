# bonk.nvim -- Technical Specification

## Overview

A Neovim plugin providing AI-powered code completion and chat using Claude via the Claude Agent SDK. Designed as a self-hosted alternative to Supermaven/Copilot for users with Claude Max subscriptions.

## Goals

- Inline code completions with ghost text rendering in Neovim
- Chat interface for asking questions about code
- Supermaven-inspired context strategy: repo indexing, edit tracking, prioritized context assembly
- Uses Claude Agent SDK (TypeScript) -- no direct API calls, no direct CLI invocation
- Works with Claude Max subscription (no API keys required)

## Non-Goals

- Real-time keystroke-level autocomplete (latency constraints make this impractical with Claude)
- Custom model training or fine-tuning
- Support for non-Claude providers
- LSP server implementation (we use HTTP + SSE, not the LSP protocol)

---

## Architecture

```
+------------------------------------------+
|              Neovim (Lua)                |
|                                          |
|  bonk/                                   |
|    init.lua        -- plugin entry       |
|    config.lua      -- user configuration |
|    server.lua      -- server lifecycle   |
|    completion.lua  -- Phase 1            |
|    chat.lua        -- Phase 2            |
|    context.lua     -- buffer/edit capture |
|    render.lua      -- ghost text / UI    |
+------------------+-----------------------+
                   |
                   | HTTP + SSE (localhost)
                   |
+------------------+-----------------------+
|          TypeScript Server (Hono)        |
|                                          |
|  src/                                    |
|    index.ts        -- entry, Hono app    |
|    routes/                               |
|      health.ts     -- GET /health        |
|      complete.ts   -- POST /complete     |
|      chat.ts       -- POST /chat         |
|    context/                              |
|      assembler.ts  -- priority ranking   |
|      repo-index.ts -- file tree index    |
|      edit-tracker.ts -- session diffs    |
|    sdk/                                  |
|      client.ts     -- Agent SDK wrapper  |
|      agents.ts     -- agent definitions  |
|    server.ts       -- lifecycle, lock    |
+------------------+-----------------------+
                   |
                   | Claude Agent SDK (TS)
                   |
+------------------+-----------------------+
|           Claude (Opus 4.6)              |
+------------------------------------------+
```

### Communication

- **Protocol:** HTTP + Server-Sent Events (SSE) over localhost
- **Port:** Random available port, written to lock file
- **Serialization:** JSON request bodies, SSE event streams for responses
- **Authentication:** None (localhost only). Lock file contains auth token for multi-instance safety.

### Server Lifecycle (Shared Singleton)

The first Neovim instance spawns the server. Subsequent instances discover and reuse it.

```
State file: ~/.local/state/bonk/server.lock

Lock file format:
{
  "pid": 12345,
  "port": 8741,
  "token": "random-uuid",
  "started_at": "2026-03-20T10:00:00Z"
}

Startup flow:
  1. Lua plugin reads lock file
  2. If missing or stale -> spawn server, wait for lock file creation
  3. If present -> GET /health with token
  4. If healthy -> connect
  5. If unhealthy -> remove stale lock, spawn new server

Shutdown flow:
  - Server tracks connected clients (register/unregister)
  - When last client disconnects, start 60s idle timer
  - If no new clients connect within 60s, graceful shutdown
  - On SIGTERM/SIGINT, immediate graceful shutdown
  - Lock file removed on shutdown
```

---

## Context Strategy

Inspired by Supermaven's approach: full repo awareness, edit tracking, prioritized context assembly.

### Repo Index

Built on server startup and kept in memory. Updated on file change notifications.

```
RepoIndex {
  root: string                          -- git root or cwd
  files: Map<string, FileEntry>         -- path -> metadata
  gitignore: string[]                   -- patterns to exclude
}

FileEntry {
  path: string          -- relative to root
  size: number          -- bytes
  language: string      -- detected from extension
  lastModified: number  -- mtime
}
```

The index is a **file tree with metadata**, not file contents. Contents are loaded on-demand during context assembly.

### Edit Tracker

Tracks buffer changes within the current session, providing Supermaven-style edit intent signals.

```
EditTracker {
  edits: EditEntry[]    -- ordered by time
  maxEntries: 100       -- rolling window
}

EditEntry {
  path: string
  timestamp: number
  diff: string          -- unified diff of the change
  cursorBefore: Position
  cursorAfter: Position
}
```

The Lua plugin sends edit diffs to the server via `POST /context/edit`. The server maintains the rolling window.

### Context Assembly

On each completion/chat request, the server assembles context by priority:

```
Default budget: 32,768 characters (configurable)

Priority 1 (always):  Current file content + cursor position
Priority 2 (always):  Recent edit diffs (last N edits from EditTracker)
Priority 3 (fill):    Files imported/required by current file
Priority 4 (fill):    Recently opened/edited buffer contents
Priority 5 (fill):    Repo file tree (paths only, for structural awareness)

Assembly algorithm:
  1. Pack Priority 1 (mandatory, no budget check)
  2. Pack Priority 2 (mandatory, no budget check)
  3. For priorities 3-5, greedily fill until budget exhausted
  4. Within each priority, rank by recency and relevance
  5. Truncate individual files if needed to fit budget
```

### Import Resolution

For Priority 3 context, the server does basic import/require detection:

```
Supported patterns:
  - import ... from '...'           (JS/TS)
  - require('...')                  (JS/TS/Lua)
  - from ... import ...             (Python)
  - use ...                         (Rust)
  - #include "..."                  (C/C++)
  - (others added over time)

Resolution:
  - Relative paths resolved against current file
  - Package imports ignored (only local files)
  - Resolved paths looked up in RepoIndex
```

---

## Phase 1: Inline Completions

### User Flow

1. User is editing code in Neovim
2. User presses their configured keybind (e.g., `<C-Space>`)
3. Ghost text appears inline at cursor, streaming token-by-token
4. User accepts (inserts text), accepts line (inserts first line only), or dismisses

### Lua Plugin Interface

```lua
-- All keybinds are user-configured. No defaults.
-- Example setup:
require('bonk').setup({
  server = {
    -- path to server directory (auto-detected from plugin install path)
    path = nil,
  },
  completion = {
    model = 'claude-opus-4-6',
    context_budget = 32768,
    max_tokens = 512,       -- max completion length
  },
})

-- Functions exposed for keybinding:
require('bonk').complete()       -- trigger completion
require('bonk').accept()         -- accept full ghost text
require('bonk').accept_line()    -- accept first line only
require('bonk').dismiss()        -- clear ghost text
require('bonk').cancel()         -- cancel in-flight request
```

### API: POST /complete

**Request:**

```json
{
  "token": "auth-uuid",
  "client_id": "nvim-12345",
  "file_path": "/absolute/path/to/file.ts",
  "filetype": "typescript",
  "buffer_content": "function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  \n}",
  "cursor": {
    "line": 2,
    "col": 2
  },
  "context": {
    "open_buffers": [
      { "path": "/absolute/path/to/utils.ts", "content": "..." }
    ],
    "recent_edits": [
      { "path": "/absolute/path/to/file.ts", "diff": "@@ -1,3 +1,4 @@..." }
    ]
  },
  "options": {
    "model": "claude-opus-4-6",
    "max_tokens": 512,
    "context_budget": 32768
  }
}
```

**Response (SSE stream):**

```
event: token
data: {"text": "return"}

event: token
data: {"text": " fibonacci(n - 1)"}

event: token
data: {"text": " + fibonacci(n - 2);"}

event: done
data: {"full_text": "return fibonacci(n - 1) + fibonacci(n - 2);", "model": "claude-opus-4-6", "usage": {"input_tokens": 1234, "output_tokens": 25}}

event: error
data: {"message": "Agent SDK error: ...", "code": "SDK_ERROR"}
```

### Ghost Text Rendering

```
Method: nvim_buf_set_extmark with namespace

First line of completion:
  - virt_text_pos = 'inline'
  - virt_text = {{ text, 'BonkGhost' }}

Subsequent lines:
  - virt_lines = { {{ text, 'BonkGhost' }} }

Highlight:
  - BonkGhost linked to Comment by default
  - User can override in their colorscheme

Behavior:
  - Only one active completion at a time
  - New trigger cancels any in-flight request and clears existing ghost text
  - Ghost text is cleared on any buffer change (InsertLeave, TextChangedI, CursorMovedI)
  - Accept inserts the text and clears the extmark
```

### Completion Agent (Server-Side)

```typescript
// Agent SDK setup for completions
const completionAgent = {
  model: "claude-opus-4-6",
  instructions: `You are a code completion engine. Given a file with a cursor position marked by <|CURSOR|>, output ONLY the code that should be inserted at that position.

Rules:
- Output raw code only. No markdown fences. No explanations.
- Match the surrounding style, indentation, and conventions.
- Complete the logical unit: finish the statement, block, or function.
- If the cursor is mid-line, complete the rest of the line and any following lines that logically belong.
- Stop when the completion is naturally complete. Do not over-generate.
- Use context from other files and recent edits to inform your completion.`,
  // No tools -- pure completion, minimal overhead
};
```

---

## Phase 2: Chat

### User Flow

1. User opens a chat panel (split or float) via command/keybind
2. User types a question, optionally with visual selection as context
3. Claude responds in the chat panel with streaming text
4. Conversation persists across messages within the panel session
5. User can reference code with `@file` mentions

### Lua Plugin Interface

```lua
-- Additional setup options for Phase 2:
require('bonk').setup({
  chat = {
    model = 'claude-opus-4-6',
    position = 'right',    -- 'right', 'left', 'bottom', 'float'
    width = 80,            -- columns (for left/right)
    height = 20,           -- lines (for bottom)
  },
})

-- Functions exposed:
require('bonk').chat_open()       -- open chat panel
require('bonk').chat_close()      -- close panel
require('bonk').chat_toggle()     -- toggle panel
require('bonk').chat_send()       -- send current input
require('bonk').chat_clear()      -- clear conversation
require('bonk').chat_ask(text)    -- programmatic question
```

### API: POST /chat

**Request:**

```json
{
  "token": "auth-uuid",
  "client_id": "nvim-12345",
  "session_id": "chat-session-abc",
  "message": "How does the fibonacci function handle negative numbers?",
  "context": {
    "file_path": "/absolute/path/to/file.ts",
    "filetype": "typescript",
    "selection": {
      "start": { "line": 0, "col": 0 },
      "end": { "line": 3, "col": 1 },
      "text": "function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}"
    },
    "mentions": [
      { "type": "file", "path": "/absolute/path/to/tests/fib.test.ts" }
    ]
  },
  "options": {
    "model": "claude-opus-4-6"
  }
}
```

**Response (SSE stream):**

```
event: token
data: {"text": "The current implementation"}

event: token
data: {"text": " doesn't handle negative numbers..."}

event: done
data: {"session_id": "chat-session-abc", "usage": {...}}
```

### Chat Panel Rendering

```
Layout (right split example):
+----------------------------+-------------------+
|                            |  Chat             |
|   Source Buffer            |                   |
|                            |  > How does the   |
|                            |    fibonacci...   |
|                            |                   |
|                            |  The current      |
|                            |  implementation   |
|                            |  doesn't handle   |
|                            |  negative...      |
|                            |                   |
|                            | [input area]      |
+----------------------------+-------------------+

Buffer types:
  - Chat display buffer: scratch, nofile, ft=markdown
  - Chat input buffer: scratch, nofile
  - Messages rendered with role markers (> for user, no prefix for assistant)
  - Syntax highlighting via treesitter markdown
```

### Chat Agent (Server-Side)

```typescript
const chatAgent = {
  model: "claude-opus-4-6",
  instructions: `You are a coding assistant embedded in Neovim. The user will ask questions about their code. You have access to their current file, selection, and referenced files.

Rules:
- Be concise and direct.
- When showing code, use markdown fences with the correct language.
- Reference specific line numbers when discussing code.
- If you need more context, say what file or function you need to see.`,
  tools: [
    // Read-only tools for deeper exploration
    "file_read",       // read any file in the repo
    "grep_search",     // search codebase
    "file_list",       // list directory contents
  ],
};
```

### Conversation Management

```
Server maintains chat sessions:

ChatSession {
  id: string
  clientId: string
  messages: Message[]     -- conversation history
  createdAt: number
  lastActiveAt: number
}

- Sessions are in-memory, not persisted across server restarts
- Sessions expire after 30 minutes of inactivity
- Each chat panel in Neovim gets its own session ID
- Message history is sent with each request so the Agent SDK has full context
```

---

## Server API Summary

| Method | Path | Phase | Description |
|--------|------|-------|-------------|
| GET | /health | All | Health check, returns server status |
| POST | /register | All | Client registers with server |
| POST | /unregister | All | Client deregisters |
| POST | /context/edit | All | Report a buffer edit for edit tracking |
| POST | /context/buffers | All | Report open buffer list |
| POST | /complete | 1 | Request inline completion (SSE) |
| POST | /chat | 2 | Send chat message (SSE) |
| GET | /status | All | Server stats, connected clients |

---

## Project Structure

```
bonk.nvim/
  lua/
    bonk/
      init.lua            -- setup(), plugin commands, public API
      config.lua          -- configuration schema, defaults, validation
      server.lua          -- spawn, discover, connect, health check
      completion.lua      -- trigger, SSE parse, accept/dismiss
      chat.lua            -- chat panel, input, message rendering
      context.lua         -- buffer tracking, edit diff capture
      render.lua          -- ghost text extmarks, highlight groups
      http.lua            -- HTTP client (curl via jobstart), SSE parser
      utils.lua           -- shared utilities
  server/
    src/
      index.ts            -- Hono app, route registration, startup
      routes/
        health.ts         -- GET /health
        register.ts       -- POST /register, /unregister
        complete.ts       -- POST /complete
        chat.ts           -- POST /chat
        context.ts        -- POST /context/edit, /context/buffers
        status.ts         -- GET /status
      context/
        assembler.ts      -- priority-based context assembly
        repo-index.ts     -- file tree indexing, .gitignore
        edit-tracker.ts   -- session edit history
        import-resolver.ts -- basic import/require detection
      sdk/
        client.ts         -- Agent SDK client management
        agents.ts         -- agent definitions (completion, chat)
      lifecycle/
        lock.ts           -- lock file management
        clients.ts        -- client registry, heartbeat, idle shutdown
      types.ts            -- shared type definitions
    package.json
    tsconfig.json
  README.md
  LICENSE
```

---

## Installation

```lua
-- lazy.nvim
{
  'username/bonk.nvim',
  build = 'cd server && npm install && npm run build',
  config = function()
    require('bonk').setup({
      completion = {
        model = 'claude-opus-4-6',
      },
    })
  end,
}
```

### Requirements

- Neovim >= 0.10.0 (for inline virtual text support)
- Node.js >= 20
- Claude Code CLI installed and authenticated (the Agent SDK uses it internally)
- Claude Max subscription

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Server not running | Lua plugin spawns it, retries connection 3 times with 1s backoff |
| Server crashes | Lua plugin detects on next request, removes stale lock, respawns |
| Agent SDK error | SSE error event sent to client, ghost text cleared, user notified |
| Request timeout | 30s default for completions, 120s for chat. Cancel sent to server on timeout. |
| Network error (localhost) | Retry once, then notify user |
| Multiple rapid triggers | New trigger cancels in-flight request before sending new one |

---

## Configuration Schema

```lua
{
  -- Server
  server = {
    path = nil,                   -- auto-detected from plugin path
    node_binary = 'node',         -- path to node executable
    log_level = 'warn',           -- 'debug', 'info', 'warn', 'error'
    idle_timeout = 60,            -- seconds before server shuts down with no clients
    state_dir = '~/.local/state/bonk/',
  },

  -- Phase 1: Completions
  completion = {
    model = 'claude-opus-4-6',
    max_tokens = 512,
    context_budget = 32768,
    timeout = 30000,              -- ms
    auto_dismiss_on = {           -- events that dismiss ghost text
      'InsertLeave',
      'BufLeave',
    },
  },

  -- Phase 2: Chat
  chat = {
    model = 'claude-opus-4-6',
    position = 'right',
    width = 80,
    height = 20,
    session_timeout = 1800,       -- seconds
  },

  -- Context
  context = {
    budget = 32768,               -- characters
    prefix_ratio = 0.75,          -- % of current-file budget for pre-cursor content
    max_file_size = 1048576,      -- 1MB, skip files larger than this
    track_edits = true,
    max_edit_history = 100,
    resolve_imports = true,
    gitignore = true,
  },

  -- UI
  highlights = {
    ghost_text = 'Comment',       -- highlight group for ghost text
  },
}
```
