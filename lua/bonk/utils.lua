local M = {}

function M.json_encode(val)
  local ok, result = pcall(vim.fn.json_encode, val)
  if ok then
    return result
  end
  return nil
end

function M.json_decode(str)
  if not str or str == '' then
    return nil
  end
  local ok, result = pcall(vim.fn.json_decode, str)
  if ok then
    return result
  end
  return nil
end

function M.log(level, msg)
  local config = require('bonk.config').get()
  local levels = { debug = 0, info = 1, warn = 2, error = 3 }
  local threshold = levels[config.server.log_level] or 2
  local current = levels[level] or 0

  if current >= threshold then
    vim.notify('[bonk] ' .. msg, vim.log.levels[string.upper(level)] or vim.log.levels.INFO)
  end
end

return M
