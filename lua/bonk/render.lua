local M = {}

local ns_id = vim.api.nvim_create_namespace('bonk')
local EXTMARK_ID = 1

function M.show(text, buf, row, col)
  if not text or text == '' then return end

  local lines = vim.split(text, '\n', { plain = true })
  local first = lines[1] or ''
  local virt_lines = {}

  for i = 2, #lines do
    table.insert(virt_lines, { { lines[i], 'BonkGhost' } })
  end

  local opts = {
    id = EXTMARK_ID,
    virt_text = { { first, 'BonkGhost' } },
    virt_text_pos = 'inline',
    hl_mode = 'replace',
  }

  if #virt_lines > 0 then
    opts.virt_lines = virt_lines
  end

  vim.api.nvim_buf_set_extmark(buf, ns_id, row, col, opts)
end

-- update is identical to show since we reuse the fixed extmark ID
M.update = M.show

function M.clear(buf)
  pcall(vim.api.nvim_buf_del_extmark, buf, ns_id, EXTMARK_ID)
end

function M.accept(buf)
  local mark = vim.api.nvim_buf_get_extmark_by_id(buf, ns_id, EXTMARK_ID, { details = true })
  if not mark or #mark == 0 then return nil end

  local row = mark[1]
  local col = mark[2]
  local details = mark[3]
  if not details then return nil end

  -- Reconstruct the full text from extmark data
  local parts = {}
  if details.virt_text then
    for _, chunk in ipairs(details.virt_text) do
      table.insert(parts, chunk[1])
    end
  end
  if details.virt_lines then
    for _, line_chunks in ipairs(details.virt_lines) do
      local line_parts = {}
      for _, chunk in ipairs(line_chunks) do
        table.insert(line_parts, chunk[1])
      end
      table.insert(parts, table.concat(line_parts))
    end
  end

  local text = table.concat(parts, '\n')
  if text == '' then return nil end

  -- Insert the text at the extmark position
  local text_lines = vim.split(text, '\n', { plain = true })
  vim.api.nvim_buf_set_text(buf, row, col, row, col, text_lines)

  -- Move cursor to end of inserted text
  local end_row = row + #text_lines - 1
  local end_col
  if #text_lines == 1 then
    end_col = col + #text_lines[1]
  else
    end_col = #text_lines[#text_lines]
  end
  pcall(vim.api.nvim_win_set_cursor, 0, { end_row + 1, end_col })

  M.clear(buf)
  return text
end

function M.accept_line(buf)
  local mark = vim.api.nvim_buf_get_extmark_by_id(buf, ns_id, EXTMARK_ID, { details = true })
  if not mark or #mark == 0 then return nil end

  local row = mark[1]
  local col = mark[2]
  local details = mark[3]
  if not details or not details.virt_text then return nil end

  -- Extract first line only
  local first_line = ''
  for _, chunk in ipairs(details.virt_text) do
    first_line = first_line .. chunk[1]
  end

  if first_line == '' then return nil end

  vim.api.nvim_buf_set_text(buf, row, col, row, col, { first_line })
  pcall(vim.api.nvim_win_set_cursor, 0, { row + 1, col + #first_line })

  M.clear(buf)
  return first_line
end

return M
