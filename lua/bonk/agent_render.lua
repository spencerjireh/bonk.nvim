local config = require('bonk.config')
local diff_mod = require('bonk.diff')

local M = {}

local state = {
  -- Status panel
  status_buf = nil,
  status_win = nil,
  source_win = nil,
  -- Diff view
  original_buf = nil,
  proposed_buf = nil,
  original_win = nil,
  proposed_win = nil,
  diff_active = false,
}

local function create_scratch_buf(name, filetype)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].swapfile = false
  vim.bo[buf].bufhidden = 'wipe'
  if name then
    pcall(vim.api.nvim_buf_set_name, buf, name)
  end
  if filetype then
    vim.bo[buf].filetype = filetype
  end
  return buf
end

-- Status panel

function M.open(task)
  state.source_win = vim.api.nvim_get_current_win()

  local cfg = config.get().agent
  vim.cmd('botright vsplit')
  vim.cmd('vertical resize ' .. (cfg.width or 50))

  state.status_buf = create_scratch_buf('bonk://agent-status', nil)
  vim.api.nvim_win_set_buf(0, state.status_buf)
  vim.bo[state.status_buf].modifiable = false
  vim.wo[0].wrap = true
  vim.wo[0].linebreak = true
  vim.wo[0].number = false
  vim.wo[0].relativenumber = false
  vim.wo[0].signcolumn = 'no'
  state.status_win = vim.api.nvim_get_current_win()

  -- Render initial content
  M.render_status({
    task = task or '',
    phase = 'starting',
    message = '',
    files = {},
    summary = { total_files = 0, total_hunks = 0, accepted = 0, rejected = 0, pending = 0 },
  })

  -- Focus back to source
  if state.source_win and vim.api.nvim_win_is_valid(state.source_win) then
    vim.api.nvim_set_current_win(state.source_win)
  end
end

function M.close()
  M.close_diff()

  if state.status_win and vim.api.nvim_win_is_valid(state.status_win) then
    vim.api.nvim_win_close(state.status_win, true)
  end

  if state.source_win and vim.api.nvim_win_is_valid(state.source_win) then
    vim.api.nvim_set_current_win(state.source_win)
  end

  state.status_buf = nil
  state.status_win = nil
end

function M.is_open()
  return state.status_win ~= nil and vim.api.nvim_win_is_valid(state.status_win)
end

function M.render_status(info)
  if not state.status_buf or not vim.api.nvim_buf_is_valid(state.status_buf) then return end

  local lines = {}
  table.insert(lines, 'Task: ' .. (info.task or ''))
  table.insert(lines, '')
  table.insert(lines, 'Status: ' .. (info.phase or ''))
  if info.message and info.message ~= '' then
    table.insert(lines, info.message)
  end
  table.insert(lines, '')
  table.insert(lines, 'Files:')

  local files = info.files or {}
  if #files == 0 then
    table.insert(lines, '  (none yet)')
  else
    for _, f in ipairs(files) do
      local hunk_count = #(f.hunks or {})
      local accepted = 0
      local rejected = 0
      for i = 1, hunk_count do
        if f.accepted and f.accepted[i] then
          accepted = accepted + 1
        end
        if f.rejected and f.rejected[i] then
          rejected = rejected + 1
        end
      end
      local marker = '~'
      if accepted == hunk_count then
        marker = '+'
      elseif rejected == hunk_count then
        marker = 'x'
      end
      table.insert(lines, string.format('  [%s] %s (%d hunks)', marker, f.path, hunk_count))
    end
  end

  table.insert(lines, '')
  local s = info.summary or {}
  table.insert(lines, string.format(
    'Summary: %d files, %d hunks | %d accepted, %d rejected, %d pending',
    s.total_files or 0, s.total_hunks or 0,
    s.accepted or 0, s.rejected or 0, s.pending or 0
  ))

  vim.bo[state.status_buf].modifiable = true
  vim.api.nvim_buf_set_lines(state.status_buf, 0, -1, false, lines)
  vim.bo[state.status_buf].modifiable = false
end

function M.update_status(phase, message)
  M.render_status({
    task = M._task or '',
    phase = phase,
    message = message,
    files = diff_mod.get_files(),
    summary = diff_mod.get_summary(),
  })
end

function M.update_tool_use(tool, status)
  -- Update status line to show current tool activity
  M.update_status('working', string.format('[%s] %s', tool or 'tool', status or ''))
end

function M.update_files()
  M.render_status({
    task = M._task or '',
    phase = 'working',
    message = '',
    files = diff_mod.get_files(),
    summary = diff_mod.get_summary(),
  })
end

function M.update_summary()
  M.render_status({
    task = M._task or '',
    phase = 'complete',
    message = '',
    files = diff_mod.get_files(),
    summary = diff_mod.get_summary(),
  })
end

function M.set_task(task)
  M._task = task
end

-- Side-by-side diff view

function M.show_diff(file_entry, hunk_index)
  if not file_entry or not file_entry.hunks or #file_entry.hunks == 0 then return end

  -- Close any existing diff
  M.close_diff()

  -- Read original file content
  local original_lines = {}
  local fpath = file_entry.path
  local ok, content = pcall(vim.fn.readfile, fpath)
  if ok then
    original_lines = content
  end

  -- Compute proposed content by applying ALL hunks for this file
  local proposed_lines = vim.deepcopy(original_lines)
  -- Apply hunks from bottom up to preserve line numbers
  local sorted_hunks = vim.deepcopy(file_entry.hunks)
  table.sort(sorted_hunks, function(a, b)
    return a.start_line > b.start_line
  end)

  for _, hunk in ipairs(sorted_hunks) do
    local old_lines = vim.split(hunk.old_text, '\n', { plain = true })
    local new_lines = vim.split(hunk.new_text, '\n', { plain = true })
    local start = hunk.start_line -- 1-based

    local end_idx = start + #old_lines - 1
    if #old_lines == 1 and old_lines[1] == '' then
      -- Pure insertion
      for i = #new_lines, 1, -1 do
        table.insert(proposed_lines, start, new_lines[i])
      end
    else
      -- Remove old, insert new
      for _ = start, math.min(end_idx, #proposed_lines) do
        table.remove(proposed_lines, start)
      end
      for i = #new_lines, 1, -1 do
        table.insert(proposed_lines, start, new_lines[i])
      end
    end
  end

  -- Detect filetype from the original file
  local ft = vim.filetype.match({ filename = fpath }) or ''

  -- Focus source window
  if state.source_win and vim.api.nvim_win_is_valid(state.source_win) then
    vim.api.nvim_set_current_win(state.source_win)
  end

  -- Create original buffer and set it in the current window
  state.original_buf = create_scratch_buf('bonk://original/' .. fpath, ft)
  vim.api.nvim_buf_set_lines(state.original_buf, 0, -1, false, original_lines)
  vim.bo[state.original_buf].modifiable = false
  vim.api.nvim_win_set_buf(0, state.original_buf)
  state.original_win = vim.api.nvim_get_current_win()

  -- Create vertical split for proposed
  vim.cmd('vsplit')
  state.proposed_buf = create_scratch_buf('bonk://proposed/' .. fpath, ft)
  vim.api.nvim_buf_set_lines(state.proposed_buf, 0, -1, false, proposed_lines)
  vim.bo[state.proposed_buf].modifiable = false
  vim.api.nvim_win_set_buf(0, state.proposed_buf)
  state.proposed_win = vim.api.nvim_get_current_win()

  -- Enable diff mode on both
  vim.api.nvim_win_call(state.original_win, function()
    vim.cmd('diffthis')
  end)
  vim.api.nvim_win_call(state.proposed_win, function()
    vim.cmd('diffthis')
  end)

  state.diff_active = true

  -- Set keymaps on both buffers
  local keymaps = {
    { 'a', function() require('bonk.agent').diff_accept() end, 'Accept hunk' },
    { 'r', function() require('bonk.agent').diff_reject() end, 'Reject hunk' },
    { 'n', function() require('bonk.agent').diff_next() end, 'Next hunk' },
    { 'p', function() require('bonk.agent').diff_prev() end, 'Prev hunk' },
    { 'A', function() require('bonk.agent').apply() end, 'Accept all' },
    { 'R', function() require('bonk.agent').reject() end, 'Reject all' },
    { 'q', function() M.close_diff() end, 'Close diff' },
  }

  for _, buf in ipairs({ state.original_buf, state.proposed_buf }) do
    if buf and vim.api.nvim_buf_is_valid(buf) then
      for _, km in ipairs(keymaps) do
        vim.keymap.set('n', km[1], km[2], { buffer = buf, desc = km[3] })
      end
    end
  end

  -- Jump to the current hunk's line
  if hunk_index and file_entry.hunks[hunk_index] then
    local target_line = file_entry.hunks[hunk_index].start_line
    pcall(vim.api.nvim_win_set_cursor, state.original_win, { target_line, 0 })
    pcall(vim.api.nvim_win_set_cursor, state.proposed_win, { target_line, 0 })
  end
end

function M.close_diff()
  if not state.diff_active then return end

  -- Turn off diff mode and close windows
  if state.proposed_win and vim.api.nvim_win_is_valid(state.proposed_win) then
    vim.api.nvim_win_call(state.proposed_win, function()
      vim.cmd('diffoff')
    end)
    vim.api.nvim_win_close(state.proposed_win, true)
  end
  if state.original_win and vim.api.nvim_win_is_valid(state.original_win) then
    vim.api.nvim_win_call(state.original_win, function()
      vim.cmd('diffoff')
    end)
  end

  state.original_buf = nil
  state.proposed_buf = nil
  state.original_win = nil
  state.proposed_win = nil
  state.diff_active = false
end

return M
