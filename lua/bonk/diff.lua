local M = {}

local state = {
  files = {},         -- { path, hunks, accepted = {}, rejected = {} }
  current_file = 0,   -- 1-based
  current_hunk = 0,   -- 1-based
}

function M.add_diff(data)
  if not data or not data.path or not data.hunks then return end

  -- Check if file already exists, replace hunks
  for i, f in ipairs(state.files) do
    if f.path == data.path then
      state.files[i].hunks = data.hunks
      state.files[i].accepted = {}
      state.files[i].rejected = {}
      return
    end
  end

  -- New file
  table.insert(state.files, {
    path = data.path,
    hunks = data.hunks,
    accepted = {},
    rejected = {},
  })

  -- Auto-select first file/hunk if nothing selected
  if state.current_file == 0 then
    state.current_file = 1
    state.current_hunk = 1
  end
end

function M.get_files()
  return state.files
end

function M.get_current()
  if state.current_file < 1 or state.current_file > #state.files then
    return nil
  end
  local file = state.files[state.current_file]
  if state.current_hunk < 1 or state.current_hunk > #file.hunks then
    return nil
  end
  return {
    file = file,
    file_index = state.current_file,
    hunk = file.hunks[state.current_hunk],
    hunk_index = state.current_hunk,
  }
end

function M.next()
  if #state.files == 0 then return nil end

  local file = state.files[state.current_file]
  if state.current_hunk < #file.hunks then
    state.current_hunk = state.current_hunk + 1
  elseif state.current_file < #state.files then
    state.current_file = state.current_file + 1
    state.current_hunk = 1
  end
  return M.get_current()
end

function M.prev()
  if #state.files == 0 then return nil end

  if state.current_hunk > 1 then
    state.current_hunk = state.current_hunk - 1
  elseif state.current_file > 1 then
    state.current_file = state.current_file - 1
    state.current_hunk = #state.files[state.current_file].hunks
  end
  return M.get_current()
end

function M.accept_current()
  local cur = M.get_current()
  if not cur then return end
  cur.file.accepted[cur.hunk_index] = true
  cur.file.rejected[cur.hunk_index] = nil
end

function M.reject_current()
  local cur = M.get_current()
  if not cur then return end
  cur.file.rejected[cur.hunk_index] = true
  cur.file.accepted[cur.hunk_index] = nil
end

function M.accept_all()
  for _, file in ipairs(state.files) do
    for i = 1, #file.hunks do
      file.accepted[i] = true
      file.rejected[i] = nil
    end
  end
end

function M.reject_all()
  for _, file in ipairs(state.files) do
    for i = 1, #file.hunks do
      file.rejected[i] = true
      file.accepted[i] = nil
    end
  end
end

function M.apply_accepted()
  for _, file in ipairs(state.files) do
    -- Collect accepted hunks
    local accepted_hunks = {}
    for i, hunk in ipairs(file.hunks) do
      if file.accepted[i] then
        table.insert(accepted_hunks, hunk)
      end
    end

    if #accepted_hunks > 0 then
      -- Sort by start_line descending (apply from bottom up)
      table.sort(accepted_hunks, function(a, b)
        return a.start_line > b.start_line
      end)

      -- Resolve to absolute path for reliable buffer lookup
      local abs_path = vim.fn.fnamemodify(vim.fn.getcwd() .. '/' .. file.path, ':p')
      local buf = vim.fn.bufnr(abs_path)
      if buf == -1 then
        buf = vim.fn.bufadd(abs_path)
        vim.fn.bufload(buf)
      end

      -- Apply each hunk
      for _, hunk in ipairs(accepted_hunks) do
        local old_lines = vim.split(hunk.old_text, '\n', { plain = true })
        local new_lines = vim.split(hunk.new_text, '\n', { plain = true })
        local start = hunk.start_line - 1 -- 0-based

        -- Replace old lines with new lines
        local end_line = start + #old_lines
        if #old_lines == 1 and old_lines[1] == '' then
          -- Insertion (no old text)
          end_line = start
        end

        vim.api.nvim_buf_set_lines(buf, start, end_line, false, new_lines)
      end

      -- Write to disk
      vim.api.nvim_buf_call(buf, function()
        vim.cmd('silent write')
      end)
    end
  end

  M.clear()
end

function M.get_summary()
  local total_files = #state.files
  local total_hunks = 0
  local accepted = 0
  local rejected = 0

  for _, file in ipairs(state.files) do
    total_hunks = total_hunks + #file.hunks
    for i = 1, #file.hunks do
      if file.accepted[i] then
        accepted = accepted + 1
      end
      if file.rejected[i] then
        rejected = rejected + 1
      end
    end
  end

  return {
    total_files = total_files,
    total_hunks = total_hunks,
    accepted = accepted,
    rejected = rejected,
    pending = total_hunks - accepted - rejected,
  }
end

function M.clear()
  state.files = {}
  state.current_file = 0
  state.current_hunk = 0
end

return M
