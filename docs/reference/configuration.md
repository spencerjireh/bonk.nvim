# Configuration

## Full Schema

```lua
require('bonk').setup({
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
})
```

## Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string?` | `nil` | Path to server directory. Auto-detected from plugin install path. |
| `node_binary` | `string` | `'node'` | Path to the Node.js executable. |
| `log_level` | `string` | `'warn'` | Log verbosity: `'debug'`, `'info'`, `'warn'`, `'error'`. |
| `idle_timeout` | `number` | `60` | Seconds before the server shuts down when no clients are connected. |
| `state_dir` | `string` | `'~/.local/state/bonk/'` | Directory for the server lock file and runtime state. |

## Completion Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `'claude-opus-4-6'` | Claude model used for completions. |
| `max_tokens` | `number` | `512` | Maximum number of tokens in a completion response. |
| `context_budget` | `number` | `32768` | Character budget for context sent with each request. |
| `timeout` | `number` | `30000` | Milliseconds before a completion request is cancelled. |
| `auto_dismiss_on` | `string[]` | `{'InsertLeave', 'BufLeave'}` | Neovim events that automatically clear ghost text. |

## Chat Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `'claude-opus-4-6'` | Claude model used for chat. |
| `position` | `string` | `'right'` | Panel position: `'right'`, `'left'`, `'bottom'`, `'float'`. |
| `width` | `number` | `80` | Panel width in columns (for `'left'`/`'right'` positions). |
| `height` | `number` | `20` | Panel height in lines (for `'bottom'` position). |
| `session_timeout` | `number` | `1800` | Seconds of inactivity before a chat session expires. |

## Context Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `budget` | `number` | `32768` | Character budget for assembled context. |
| `prefix_ratio` | `number` | `0.75` | Proportion of the current-file budget allocated to content before the cursor. |
| `max_file_size` | `number` | `1048576` | Files larger than this (bytes) are skipped during context assembly. |
| `track_edits` | `boolean` | `true` | Whether to track buffer edits for context. |
| `max_edit_history` | `number` | `100` | Maximum number of edit entries in the rolling window. |
| `resolve_imports` | `boolean` | `true` | Whether to resolve imports/requires for Priority 3 context. |
| `gitignore` | `boolean` | `true` | Whether to respect `.gitignore` patterns in the repo index. |

## Highlight Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ghost_text` | `string` | `'Comment'` | Highlight group that `BonkGhost` is linked to. |

Override the ghost text appearance in your colorscheme:

```lua
vim.api.nvim_set_hl(0, 'BonkGhost', { fg = '#6a6a6a', italic = true })
```
