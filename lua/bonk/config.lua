local M = {}

local defaults = {
  server = {
    path = nil,
    node_binary = 'node',
    log_level = 'warn',
    idle_timeout = 60,
    state_dir = '~/.local/state/bonk/',
  },
  completion = {
    model = 'claude-opus-4-6',
    max_tokens = 512,
    context_budget = 32768,
    timeout = 30000,
    auto_dismiss_on = {
      'InsertLeave',
      'BufLeave',
    },
  },
  chat = {
    model = 'claude-opus-4-6',
    position = 'right',
    width = 80,
    height = 20,
  },
  agent = {
    model = 'claude-opus-4-6',
    position = 'right',
    width = 50,
    auto_apply = false,
    allow_commands = false,
    allowed_paths = nil,
    timeout = 300000,
    max_turns = 25,
  },
  highlights = {
    ghost_text = 'Comment',
    chat_user = 'Title',
    chat_tool_use = 'DiagnosticInfo',
    chat_separator = 'Comment',
    diff_add = 'DiffAdd',
    diff_delete = 'DiffDelete',
  },
}

local config = vim.deepcopy(defaults)

function M.setup(opts)
  config = vim.tbl_deep_extend('force', defaults, opts or {})
end

function M.get()
  return config
end

return M
