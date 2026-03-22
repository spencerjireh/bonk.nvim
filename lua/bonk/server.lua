local utils = require('bonk.utils')
local config = require('bonk.config')

local M = {}

-- Module state
local state = {
  job_id = nil,
  port = nil,
  token = nil,
  client_id = 'nvim-' .. vim.fn.getpid(),
  connected = false,
}

-- Resolve the server directory from the plugin's install path
local function get_server_dir()
  local cfg = config.get()
  if cfg.server.path then
    return cfg.server.path
  end
  -- Derive from this file's location: lua/bonk/server.lua -> ../../server
  local source = debug.getinfo(1, 'S').source:sub(2)
  local plugin_dir = vim.fn.fnamemodify(source, ':h:h:h')
  return plugin_dir .. '/server'
end

local function get_lock_path()
  local cfg = config.get()
  return vim.fn.expand(cfg.server.state_dir) .. 'server.lock'
end

local function read_lock()
  local path = get_lock_path()
  local f = io.open(path, 'r')
  if not f then
    return nil
  end
  local content = f:read('*a')
  f:close()
  return utils.json_decode(content)
end

function M.health_check(port, token, callback)
  local url = string.format('http://127.0.0.1:%d/health?token=%s', port, token)
  vim.fn.jobstart({ 'curl', '--silent', '--max-time', '2', url }, {
    stdout_buffered = true,
    on_stdout = function(_, data)
      local body = table.concat(data, '')
      local result = utils.json_decode(body)
      if result and result.status == 'ok' then
        callback(true)
      else
        callback(false)
      end
    end,
    on_exit = function(_, code)
      if code ~= 0 then
        callback(false)
      end
    end,
  })
end

local function spawn_server(callback)
  local cfg = config.get()
  local server_dir = get_server_dir()
  local entry = server_dir .. '/dist/index.js'

  if vim.fn.filereadable(entry) == 0 then
    utils.log('error', 'Server not built. Run: cd server && npm install && npm run build')
    callback(false)
    return
  end

  local stdout_buf = ''

  state.job_id = vim.fn.jobstart({
    cfg.server.node_binary, entry,
    '--repo-root', vim.fn.getcwd(),
  }, {
    detach = true,
    on_stdout = function(_, data)
      for _, line in ipairs(data) do
        stdout_buf = stdout_buf .. line
        local ready_pos = stdout_buf:find('BONK_READY:')
        if ready_pos then
          local json_str = stdout_buf:sub(ready_pos + 11)
          -- Strip trailing newline
          json_str = json_str:gsub('%s+$', '')
          local info = utils.json_decode(json_str)
          if info and info.port and info.token then
            state.port = info.port
            state.token = info.token
            utils.log('info', string.format('Server started on port %d', info.port))
            callback(true)
          end
          stdout_buf = ''
        end
      end
    end,
    on_exit = function(_, code)
      if code ~= 0 then
        utils.log('warn', 'Server process exited with code ' .. code)
      end
      state.job_id = nil
      state.port = nil
      state.token = nil
      state.connected = false
    end,
  })

  if state.job_id <= 0 then
    utils.log('error', 'Failed to start server')
    state.job_id = nil
    callback(false)
  end
end

function M.register_client()
  if not state.port or not state.token then return end

  local http = require('bonk.http')
  local url = string.format('http://127.0.0.1:%d/register', state.port)
  http.post(url, {
    token = state.token,
    client_id = state.client_id,
  }, function(ok)
    if ok then
      state.connected = true
      utils.log('debug', 'Client registered')
    end
  end)
end

function M.unregister_client()
  if not state.port or not state.token or not state.connected then return end

  local http = require('bonk.http')
  local url = string.format('http://127.0.0.1:%d/unregister', state.port)
  http.post(url, {
    token = state.token,
    client_id = state.client_id,
  }, function()
    state.connected = false
    utils.log('debug', 'Client unregistered')
  end)
end

function M.ensure_running(callback)
  -- Try existing lock file first
  local lock = read_lock()
  if lock and lock.port and lock.token then
    M.health_check(lock.port, lock.token, vim.schedule_wrap(function(healthy)
      if healthy then
        state.port = lock.port
        state.token = lock.token
        if not state.connected then
          M.register_client()
        end
        callback(true)
      else
        -- Stale lock, spawn new
        spawn_server(vim.schedule_wrap(function(ok)
          if ok then
            M.register_client()
          end
          callback(ok)
        end))
      end
    end))
    return
  end

  -- No lock file, spawn server
  spawn_server(vim.schedule_wrap(function(ok)
    if ok then
      M.register_client()
    end
    callback(ok)
  end))
end

function M.get_base_url()
  if not state.port then return nil end
  return string.format('http://127.0.0.1:%d', state.port)
end

function M.get_token()
  return state.token
end

function M.get_client_id()
  return state.client_id
end

function M.is_connected()
  return state.connected
end

return M
