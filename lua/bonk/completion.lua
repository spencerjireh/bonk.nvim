local server = require('bonk.server')
local http = require('bonk.http')
local render = require('bonk.render')
local context = require('bonk.context')
local config = require('bonk.config')
local utils = require('bonk.utils')

local M = {}

-- State
local active_job = nil
local accumulated_text = ''
local trigger_buf = nil
local trigger_row = nil
local trigger_col = nil

function M.trigger()
  -- Cancel any existing completion
  M.cancel()

  local buf = vim.api.nvim_get_current_buf()
  local cursor = vim.api.nvim_win_get_cursor(0)
  trigger_buf = buf
  trigger_row = cursor[1] - 1
  trigger_col = cursor[2]

  server.ensure_running(function(ok)
    if not ok then
      utils.log('error', 'Server not available')
      return
    end

    local base_url = server.get_base_url()
    local token = server.get_token()
    if not base_url or not token then return end

    local ctx = context.get_completion_context()
    local cfg = config.get()

    local body = {
      token = token,
      client_id = server.get_client_id(),
      file_path = ctx.file_path,
      filetype = ctx.filetype,
      buffer_content = ctx.buffer_content,
      cursor = ctx.cursor,
      context = ctx.context,
      options = {
        model = cfg.completion.model,
        max_tokens = cfg.completion.max_tokens,
        context_budget = cfg.completion.context_budget,
      },
    }

    local url = base_url .. '/complete'
    accumulated_text = ''

    active_job = http.post_sse(url, body, {
      on_token = function(data)
        if data and data.text then
          accumulated_text = accumulated_text .. data.text
          render.update(accumulated_text, trigger_buf, trigger_row, trigger_col)
        end
      end,
      on_done = function(data)
        if data and data.full_text then
          accumulated_text = data.full_text
          render.update(accumulated_text, trigger_buf, trigger_row, trigger_col)
        end
        active_job = nil
      end,
      on_error = function(data)
        local msg = data and data.message or 'Unknown error'
        utils.log('error', 'Completion error: ' .. msg)
        M.cancel()
      end,
      on_complete = function()
        active_job = nil
      end,
    })
  end)
end

function M.cancel()
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end
  accumulated_text = ''
  if trigger_buf and vim.api.nvim_buf_is_valid(trigger_buf) then
    render.clear(trigger_buf)
  end
end

function M.accept()
  if accumulated_text == '' then return end
  local buf = vim.api.nvim_get_current_buf()
  render.accept(buf)
  accumulated_text = ''
  active_job = nil
end

function M.accept_line()
  if accumulated_text == '' then return end
  local buf = vim.api.nvim_get_current_buf()
  render.accept_line(buf)
  accumulated_text = ''
  active_job = nil
end

function M.dismiss()
  if accumulated_text == '' and not active_job then return end
  M.cancel()
end

function M.is_active()
  return active_job ~= nil or accumulated_text ~= ''
end

return M
