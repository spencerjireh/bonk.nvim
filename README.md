# bonk.nvim

AI code completions in Neovim, powered by Claude. A self-hosted alternative to Supermaven/Copilot for people with a Claude Max subscription.

You press a key, ghost text streams in, you hit tab. That's it.

## Requirements

- Neovim >= 0.10.0
- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Claude Max subscription (no API keys needed)

## Install

### lazy.nvim

```lua
{
  'username/bonk.nvim',
  build = 'cd server && npm install && npm run build',
  config = function()
    require('bonk').setup()
  end,
}
```

### Manual

```sh
git clone https://github.com/username/bonk.nvim ~/.local/share/nvim/site/pack/bonk/start/bonk.nvim
cd ~/.local/share/nvim/site/pack/bonk/start/bonk.nvim/server
npm install && npm run build
```

Then in your config:

```lua
require('bonk').setup()
```

## Keybindings

bonk.nvim sets no keybindings by default. Wire them up yourself:

```lua
vim.keymap.set('i', '<C-Space>', require('bonk').complete)
vim.keymap.set('i', '<Tab>', require('bonk').accept)
vim.keymap.set('i', '<C-]>', require('bonk').accept_line)
vim.keymap.set('i', '<Esc>', require('bonk').dismiss)
```

| Function       | What it does                                     |
|----------------|--------------------------------------------------|
| `complete()`   | Trigger a completion at the cursor               |
| `accept()`     | Insert the full ghost text into the buffer       |
| `accept_line()`| Insert only the first line of the ghost text     |
| `dismiss()`    | Clear ghost text and cancel any in-flight request|
| `cancel()`     | Same as dismiss                                  |

## Configuration

All options with their defaults:

```lua
require('bonk').setup({
  server = {
    path = nil,                   -- auto-detected from plugin install path
    node_binary = 'node',         -- path to node executable
    log_level = 'warn',           -- 'debug' | 'info' | 'warn' | 'error'
    idle_timeout = 60,            -- seconds before server shuts down with no clients
    state_dir = '~/.local/state/bonk/',
  },

  completion = {
    model = 'claude-opus-4-6',    -- model for completions
    max_tokens = 512,             -- max completion length
    context_budget = 32768,       -- chars of context to send
    timeout = 30000,              -- ms before request is cancelled
    auto_dismiss_on = {           -- events that clear ghost text
      'InsertLeave',
      'BufLeave',
    },
  },

  highlights = {
    ghost_text = 'Comment',       -- highlight group for ghost text
  },
})
```

### Highlight customization

Ghost text uses the `BonkGhost` highlight group, linked to `Comment` by default. Override it in your colorscheme:

```lua
vim.api.nvim_set_hl(0, 'BonkGhost', { fg = '#6a6a6a', italic = true })
```

## Architecture

bonk.nvim is a two-process system:

```
Neovim (Lua)  <--HTTP/SSE-->  Node.js Server (TypeScript)  <--Agent SDK-->  Claude
```

**Why two processes?** Neovim's Lua runtime is single-threaded. If we called Claude directly from Lua, your editor would freeze while waiting for a response. Instead, the Lua plugin fires off HTTP requests to a local TypeScript server, which handles the async Claude Agent SDK calls and streams results back via Server-Sent Events.

### Server lifecycle

The first Neovim instance spawns the server. Subsequent instances discover it via a lock file at `~/.local/state/bonk/server.lock` and reuse the same process. When all Neovim instances disconnect, the server shuts itself down after 60 seconds of idle time.

### Context strategy

Inspired by Supermaven's approach. On each completion request, the server assembles context by priority:

1. **Current file** with cursor position (always included)
2. **Recent edit diffs** from the current session (always included)
3. **Imported/required files** resolved from the current file (fill)
4. **Open buffer contents** from other tabs (fill)
5. **Repo file tree** for structural awareness (fill)

Priorities 3-5 are packed greedily until the context budget (default 32K chars) is exhausted.

## How it works

1. You press your trigger keybind
2. Lua captures your buffer content, cursor position, and open buffers
3. Lua sends a POST to the local server's `/complete` endpoint
4. Server assembles context, calls Claude via the Agent SDK
5. Tokens stream back as SSE events
6. Lua renders each token as inline ghost text via extmarks
7. You accept, accept the first line, or dismiss

## Roadmap

bonk.nvim is being built in phases:

- **Phase 1: Inline completions** -- done. Ghost text streaming, accept/dismiss, context assembly.
- **Phase 2: Chat** -- a split/float panel for asking questions about your code with conversation history.

> Agent mode was considered but intentionally dropped -- Claude Code in a terminal is strictly better for multi-file edits. bonk.nvim focuses on what an editor plugin does best: inline completions and contextual chat.
