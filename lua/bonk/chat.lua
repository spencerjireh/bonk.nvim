local server = require('bonk.server')
local http = require('bonk.http')
local chat_render = require('bonk.chat_render')
local context = require('bonk.context')
local config = require('bonk.config')
local utils = require('bonk.utils')

local M = {}

local session_id = nil
local active_job = nil

local function generate_session_id()
  return 'chat-' .. vim.fn.localtime() .. '-' .. math.random(1000, 9999)
end

local function do_send(text)
  -- Cancel any active request
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end

  local base_url = server.get_base_url()
  local token = server.get_token()
  if not base_url or not token then
    utils.log('error', 'Server not connected')
    return
  end

  -- Gather context from the source buffer
  local ctx = context.get_chat_context(chat_render.get_source_buf())

  -- Render user message
  chat_render.append_user_message(text)
  chat_render.start_assistant_response()

  local cfg = config.get()

  local body = {
    token = token,
    client_id = server.get_client_id(),
    session_id = session_id,
    message = text,
    context = ctx,
    options = {
      model = cfg.chat.model,
    },
  }

  local url = base_url .. '/chat'

  active_job = http.post_sse(url, body, {
    on_token = function(data)
      if data and data.text then
        chat_render.append_token(data.text)
      end
    end,
    on_tool_use = function(data)
      if data then
        chat_render.append_tool_use(data.tool, data.status)
      end
    end,
    on_done = function(_data)
      chat_render.finish_assistant_response()
      -- session_id from server is stored server-side for multi-turn resume
      active_job = nil
      chat_render.focus_input()
    end,
    on_error = function(data)
      local msg = data and data.message or 'Unknown error'
      utils.log('error', 'Chat error: ' .. msg)
      chat_render.finish_assistant_response()
      active_job = nil
    end,
    on_complete = function()
      active_job = nil
    end,
  })
end

function M.open()
  if chat_render.is_open() then
    chat_render.focus_input()
    return
  end

  server.ensure_running(function(ok)
    if not ok then
      utils.log('error', 'Server not available')
      return
    end

    chat_render.create_panel()
    if not session_id then
      session_id = generate_session_id()
    end
    chat_render.focus_input()
  end)
end

function M.close()
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end
  chat_render.close_panel()
  -- Session persists so we can reopen and continue
end

function M.toggle()
  if chat_render.is_open() then
    M.close()
  else
    M.open()
  end
end

function M.send()
  local text = chat_render.get_input_text()
  if text == '' then return end
  chat_render.clear_input()
  do_send(text)
end

function M.ask(text)
  if not text or text == '' then return end

  if not chat_render.is_open() then
    server.ensure_running(function(ok)
      if not ok then
        utils.log('error', 'Server not available')
        return
      end
      chat_render.create_panel()
      if not session_id then
        session_id = generate_session_id()
      end
      do_send(text)
    end)
  else
    do_send(text)
  end
end

function M.clear()
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end

  chat_render.clear()

  -- Tell server to clear the session
  local base_url = server.get_base_url()
  local token = server.get_token()
  if base_url and token and session_id then
    http.post(base_url .. '/chat/clear', {
      token = token,
      session_id = session_id,
    })
  end

  session_id = generate_session_id()
end

return M
