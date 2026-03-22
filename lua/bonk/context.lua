local M = {}

function M.get_completion_context()
  local buf = vim.api.nvim_get_current_buf()
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  local cursor = vim.api.nvim_win_get_cursor(0)

  -- Convert to 0-indexed
  local row = cursor[1] - 1
  local col = cursor[2]

  local file_path = vim.api.nvim_buf_get_name(buf)
  local filetype = vim.bo[buf].filetype

  -- Gather open buffers (excluding current)
  local open_buffers = {}
  for _, b in ipairs(vim.api.nvim_list_bufs()) do
    if b ~= buf and vim.api.nvim_buf_is_loaded(b) and vim.bo[b].buflisted then
      local name = vim.api.nvim_buf_get_name(b)
      if name ~= '' then
        local buf_lines = vim.api.nvim_buf_get_lines(b, 0, -1, false)
        table.insert(open_buffers, {
          path = name,
          content = table.concat(buf_lines, '\n'),
        })
      end
    end
  end

  return {
    file_path = file_path,
    filetype = filetype,
    buffer_content = table.concat(lines, '\n'),
    cursor = {
      line = row,
      col = col,
    },
    context = {
      open_buffers = open_buffers,
    },
  }
end

return M
