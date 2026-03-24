local server = require('bonk.server')
local http = require('bonk.http')
local agent_render = require('bonk.agent_render')
local diff_mod = require('bonk.diff')
local config = require('bonk.config')
local context = require('bonk.context')
local utils = require('bonk.utils')

local M = {}

local session_id = nil
local active_job = nil

local function generate_session_id()
  return 'agent-' .. vim.fn.localtime() .. '-' .. math.random(1000, 9999)
end

function M.start(task)
  if not task or task == '' then
    utils.log('error', 'No task provided')
    return
  end

  -- Cancel any existing agent
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end

  session_id = generate_session_id()

  server.ensure_running(function(ok)
    if not ok then
      utils.log('error', 'Server not available')
      return
    end

    -- Open status panel
    agent_render.set_task(task)
    agent_render.open(task)

    local base_url = server.get_base_url()
    local token = server.get_token()
    if not base_url or not token then return end

    local cfg = config.get()
    local ctx = context.get_chat_context()

    local body = {
      token = token,
      client_id = server.get_client_id(),
      session_id = session_id,
      task = task,
      context = {
        file_path = ctx.file_path,
        filetype = ctx.filetype,
        working_directory = vim.fn.getcwd(),
      },
      options = {
        model = cfg.agent.model,
        allow_commands = cfg.agent.allow_commands,
        allowed_paths = cfg.agent.allowed_paths,
        max_turns = cfg.agent.max_turns,
      },
    }

    local url = base_url .. '/agent'
    local first_diff = true

    active_job = http.post_sse(url, body, {
      on_status = function(data)
        if data then
          agent_render.update_status(data.phase or '', data.message or '')
        end
      end,
      on_tool_use = function(data)
        if data then
          agent_render.update_tool_use(data.tool, data.status)
        end
      end,
      on_diff = function(data)
        if data then
          diff_mod.add_diff(data)
          agent_render.update_files()
          -- Auto-show first diff
          if first_diff then
            first_diff = false
            local cur = diff_mod.get_current()
            if cur then
              agent_render.show_diff(cur.file, cur.hunk_index)
            end
          end
        end
      end,
      on_done = function(_data)
        agent_render.update_summary()
        active_job = nil
      end,
      on_error = function(data)
        local msg = data and data.message or 'Unknown error'
        utils.log('error', 'Agent error: ' .. msg)
        agent_render.update_status('error', msg)
        active_job = nil
      end,
      on_complete = function()
        active_job = nil
      end,
    })
  end)
end

function M.stop()
  if active_job then
    http.cancel(active_job)
    active_job = nil
  end

  local base_url = server.get_base_url()
  local token = server.get_token()
  if base_url and token then
    http.post(base_url .. '/agent/stop', {
      token = token,
      client_id = server.get_client_id(),
      session_id = session_id,
    })
  end

  agent_render.update_status('stopped', 'Agent stopped by user')
end

function M.apply()
  diff_mod.apply_accepted()
  agent_render.close_diff()
  agent_render.update_summary()
end

function M.reject()
  diff_mod.reject_all()
  agent_render.close_diff()
  agent_render.update_summary()
end

function M.diff_next()
  local cur = diff_mod.next()
  if cur then
    agent_render.show_diff(cur.file, cur.hunk_index)
  end
end

function M.diff_prev()
  local cur = diff_mod.prev()
  if cur then
    agent_render.show_diff(cur.file, cur.hunk_index)
  end
end

function M.diff_accept()
  diff_mod.accept_current()
  agent_render.update_files()
  -- Advance to next
  local cur = diff_mod.next()
  if cur then
    agent_render.show_diff(cur.file, cur.hunk_index)
  end
end

function M.diff_reject()
  diff_mod.reject_current()
  agent_render.update_files()
  -- Advance to next
  local cur = diff_mod.next()
  if cur then
    agent_render.show_diff(cur.file, cur.hunk_index)
  end
end

return M
