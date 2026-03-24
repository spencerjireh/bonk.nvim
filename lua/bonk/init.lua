local M = {}

function M.setup(opts)
  require('bonk.config').setup(opts)

  local config = require('bonk.config').get()

  -- Create highlight groups
  vim.api.nvim_set_hl(0, 'BonkGhost', { link = config.highlights.ghost_text, default = true })
  vim.api.nvim_set_hl(0, 'BonkChatUser', { link = config.highlights.chat_user, default = true })
  vim.api.nvim_set_hl(0, 'BonkChatToolUse', { link = config.highlights.chat_tool_use, default = true })

  -- Auto-dismiss autocmds
  local group = vim.api.nvim_create_augroup('bonk', { clear = true })

  for _, event in ipairs(config.completion.auto_dismiss_on) do
    vim.api.nvim_create_autocmd(event, {
      group = group,
      callback = function()
        local completion = require('bonk.completion')
        if completion.is_active() then
          completion.dismiss()
        end
      end,
    })
  end

  -- :BonkReload command
  vim.api.nvim_create_user_command('BonkReload', function()
    local current_config = require('bonk.config').get()
    require('bonk.reload').reload()
    require('bonk').setup(current_config)
  end, { desc = 'Reload all bonk.nvim Lua modules' })

  -- Unregister client on exit
  vim.api.nvim_create_autocmd('VimLeavePre', {
    group = group,
    callback = function()
      require('bonk.server').unregister_client()
    end,
  })
end

function M.complete()
  require('bonk.completion').trigger()
end

function M.accept()
  require('bonk.completion').accept()
end

function M.accept_line()
  require('bonk.completion').accept_line()
end

function M.dismiss()
  require('bonk.completion').dismiss()
end

function M.cancel()
  require('bonk.completion').cancel()
end

-- Chat API
function M.chat_open()
  require('bonk.chat').open()
end

function M.chat_close()
  require('bonk.chat').close()
end

function M.chat_toggle()
  require('bonk.chat').toggle()
end

function M.chat_send()
  require('bonk.chat').send()
end

function M.chat_clear()
  require('bonk.chat').clear()
end

function M.chat_ask(text)
  require('bonk.chat').ask(text)
end

return M
