local M = {}

function M.reload()
  for name, _ in pairs(package.loaded) do
    if name:match('^bonk%.') or name == 'bonk' then
      package.loaded[name] = nil
    end
  end
  vim.notify('[bonk] Lua modules reloaded', vim.log.levels.INFO)
end

return M
