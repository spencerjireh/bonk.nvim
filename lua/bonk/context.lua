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

function M.get_visual_selection()
  local start_pos = vim.fn.getpos("'<")
  local end_pos = vim.fn.getpos("'>")
  local start_line = start_pos[2] - 1
  local start_col = start_pos[3] - 1
  local end_line = end_pos[2] - 1
  local end_col = end_pos[3]

  local buf = vim.api.nvim_get_current_buf()
  local lines = vim.api.nvim_buf_get_lines(buf, start_line, end_line + 1, false)
  if #lines == 0 then return nil end

  -- Trim to selection boundaries
  if #lines == 1 then
    lines[1] = lines[1]:sub(start_col + 1, end_col)
  else
    lines[1] = lines[1]:sub(start_col + 1)
    lines[#lines] = lines[#lines]:sub(1, end_col)
  end

  return {
    start = { line = start_line, col = start_col },
    ['end'] = { line = end_line, col = end_col },
    text = table.concat(lines, '\n'),
  }
end

function M.get_chat_context(source_buf)
  local buf = source_buf or vim.api.nvim_get_current_buf()
  local file_path = vim.api.nvim_buf_get_name(buf)
  local filetype = ''
  if vim.api.nvim_buf_is_valid(buf) then
    filetype = vim.bo[buf].filetype or ''
  end

  return {
    file_path = file_path ~= '' and file_path or nil,
    filetype = filetype ~= '' and filetype or nil,
  }
end

return M
