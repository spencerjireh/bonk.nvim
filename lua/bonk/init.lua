local M = {}

function M.setup(opts)
  require('bonk.config').setup(opts)

  local config = require('bonk.config').get()

  -- Create highlight group
  vim.api.nvim_set_hl(0, 'BonkGhost', { link = config.highlights.ghost_text, default = true })

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

return M
