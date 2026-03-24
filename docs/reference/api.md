# Server API

## Endpoints

| Method | Path | Phase | Description |
|--------|------|-------|-------------|
| GET | `/health` | All | Health check, returns server status |
| POST | `/register` | All | Client registers with server |
| POST | `/unregister` | All | Client deregisters |
| POST | `/context/edit` | All | Report a buffer edit for edit tracking |
| POST | `/context/buffers` | All | Report open buffer list |
| POST | `/complete` | 1 | Request inline completion (SSE) |
| POST | `/chat` | 2 | Send chat message (SSE) |
| GET | `/status` | All | Server stats, connected clients |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Server not running | Lua plugin spawns it, retries connection 3 times with 1s backoff |
| Server crashes | Lua plugin detects on next request, removes stale lock, respawns |
| Agent SDK error | SSE error event sent to client, ghost text cleared, user notified |
| Request timeout | 30s default for completions, 120s for chat. Cancel sent to server on timeout. |
| Network error (localhost) | Retry once, then notify user |
| Multiple rapid triggers | New trigger cancels in-flight request before sending new one |

## Installation

### Requirements

- Neovim >= 0.10.0 (for inline virtual text support)
- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (the Agent SDK uses it internally)
- Claude Max subscription

### lazy.nvim

```lua
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
