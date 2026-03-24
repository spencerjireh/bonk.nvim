local config = require('bonk.config')

local M = {}

local state = {
  display_buf = nil,
  input_buf = nil,
  chat_win = nil,
  input_win = nil,
  source_win = nil,
  source_buf = nil,
  streaming_line = nil,
}

local function create_buf(name, filetype)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].swapfile = false
  vim.bo[buf].bufhidden = 'wipe'
  vim.api.nvim_buf_set_name(buf, name)
  if filetype then
    vim.bo[buf].filetype = filetype
  end
  return buf
end

function M.create_panel()
  local cfg = config.get().chat

  -- Remember where we came from
  state.source_win = vim.api.nvim_get_current_win()
  state.source_buf = vim.api.nvim_win_get_buf(state.source_win)

  -- Create the chat split
  local pos = cfg.position or 'right'
  if pos == 'right' then
    vim.cmd('botright vsplit')
    vim.cmd('vertical resize ' .. (cfg.width or 80))
  elseif pos == 'left' then
    vim.cmd('topleft vsplit')
    vim.cmd('vertical resize ' .. (cfg.width or 80))
  elseif pos == 'bottom' then
    vim.cmd('botright split')
    vim.cmd('resize ' .. (cfg.height or 20))
  else
    -- float
    local width = cfg.width or 80
    local height = cfg.height or 20
    local ui = vim.api.nvim_list_uis()[1]
    local row = math.floor((ui.height - height) / 2)
    local col = math.floor((ui.width - width) / 2)
    local float_buf = create_buf('bonk://chat', 'markdown')
    state.display_buf = float_buf
    state.chat_win = vim.api.nvim_open_win(float_buf, true, {
      relative = 'editor',
      width = width,
      height = height,
      row = row,
      col = col,
      style = 'minimal',
      border = 'rounded',
    })
    vim.bo[float_buf].modifiable = false
    -- No input split for float -- use the same buffer
    state.input_buf = nil
    state.input_win = nil
    return true
  end

  -- We are now in the chat split window
  state.display_buf = create_buf('bonk://chat', 'markdown')
  vim.api.nvim_win_set_buf(0, state.display_buf)
  vim.bo[state.display_buf].modifiable = false
  vim.wo[0].wrap = true
  vim.wo[0].linebreak = true
  vim.wo[0].number = false
  vim.wo[0].relativenumber = false
  vim.wo[0].signcolumn = 'no'
  state.chat_win = vim.api.nvim_get_current_win()

  -- Create input split at the bottom of the chat window
  vim.cmd('belowright split')
  vim.cmd('resize 3')
  state.input_buf = create_buf('bonk://chat-input', nil)
  vim.api.nvim_win_set_buf(0, state.input_buf)
  vim.wo[0].number = false
  vim.wo[0].relativenumber = false
  vim.wo[0].signcolumn = 'no'
  vim.wo[0].winfixheight = true
  state.input_win = vim.api.nvim_get_current_win()

  -- Set up input keymaps
  local send = function()
    require('bonk.chat').send()
  end
  vim.keymap.set('n', '<CR>', send, { buffer = state.input_buf, desc = 'Send chat message' })
  vim.keymap.set('i', '<C-CR>', send, { buffer = state.input_buf, desc = 'Send chat message' })

  return true
end

function M.close_panel()
  -- Close windows (order matters -- close input first)
  if state.input_win and vim.api.nvim_win_is_valid(state.input_win) then
    vim.api.nvim_win_close(state.input_win, true)
  end
  if state.chat_win and vim.api.nvim_win_is_valid(state.chat_win) then
    vim.api.nvim_win_close(state.chat_win, true)
  end

  -- Focus source window
  if state.source_win and vim.api.nvim_win_is_valid(state.source_win) then
    vim.api.nvim_set_current_win(state.source_win)
  end

  state.display_buf = nil
  state.input_buf = nil
  state.chat_win = nil
  state.input_win = nil
  state.streaming_line = nil
end

function M.is_open()
  return state.chat_win ~= nil and vim.api.nvim_win_is_valid(state.chat_win)
end

function M.get_source_buf()
  return state.source_buf
end

local function buf_valid()
  return state.display_buf and vim.api.nvim_buf_is_valid(state.display_buf)
end

local function set_modifiable(val)
  if buf_valid() then
    vim.bo[state.display_buf].modifiable = val
  end
end

local function buf_line_count()
  return vim.api.nvim_buf_line_count(state.display_buf)
end

local function scroll_to_bottom()
  if state.chat_win and vim.api.nvim_win_is_valid(state.chat_win) then
    local count = buf_line_count()
    vim.api.nvim_win_set_cursor(state.chat_win, { count, 0 })
  end
end

function M.append_user_message(text)
  if not buf_valid() then return end
  set_modifiable(true)

  local count = buf_line_count()
  local lines = {}

  -- Add separator if not first message
  if count > 1 or (count == 1 and vim.api.nvim_buf_get_lines(state.display_buf, 0, 1, false)[1] ~= '') then
    table.insert(lines, '')
  end

  -- Format as markdown blockquote
  for _, line in ipairs(vim.split(text, '\n')) do
    table.insert(lines, '> ' .. line)
  end
  table.insert(lines, '')

  vim.api.nvim_buf_set_lines(state.display_buf, -1, -1, false, lines)
  set_modifiable(false)
  scroll_to_bottom()
end

function M.start_assistant_response()
  if not buf_valid() then return end
  state.streaming_line = buf_line_count()
end

function M.append_token(text)
  if not buf_valid() then return end
  set_modifiable(true)

  local count = buf_line_count()
  local last_line = vim.api.nvim_buf_get_lines(state.display_buf, count - 1, count, false)[1] or ''

  -- Split incoming text by newlines
  local parts = vim.split(text, '\n', { plain = true })

  if #parts == 1 then
    -- Append to the last line
    vim.api.nvim_buf_set_lines(state.display_buf, count - 1, count, false, { last_line .. parts[1] })
  else
    -- First part extends last line, rest are new lines
    local new_lines = { last_line .. parts[1] }
    for i = 2, #parts do
      table.insert(new_lines, parts[i])
    end
    vim.api.nvim_buf_set_lines(state.display_buf, count - 1, count, false, new_lines)
  end

  set_modifiable(false)
  scroll_to_bottom()
end

function M.finish_assistant_response()
  if not buf_valid() then return end
  set_modifiable(true)
  vim.api.nvim_buf_set_lines(state.display_buf, -1, -1, false, { '', '---' })
  set_modifiable(false)
  state.streaming_line = nil
  scroll_to_bottom()
end

function M.append_tool_use(tool, status)
  if not buf_valid() then return end
  set_modifiable(true)
  local msg = string.format('[%s: %s]', tool or 'tool', status or '')
  vim.api.nvim_buf_set_lines(state.display_buf, -1, -1, false, { msg })
  set_modifiable(false)
  scroll_to_bottom()
end

function M.clear()
  if not buf_valid() then return end
  set_modifiable(true)
  vim.api.nvim_buf_set_lines(state.display_buf, 0, -1, false, { '' })
  set_modifiable(false)
  state.streaming_line = nil
end

function M.get_input_text()
  if not state.input_buf or not vim.api.nvim_buf_is_valid(state.input_buf) then
    return ''
  end
  local lines = vim.api.nvim_buf_get_lines(state.input_buf, 0, -1, false)
  return vim.trim(table.concat(lines, '\n'))
end

function M.clear_input()
  if state.input_buf and vim.api.nvim_buf_is_valid(state.input_buf) then
    vim.api.nvim_buf_set_lines(state.input_buf, 0, -1, false, { '' })
  end
end

function M.focus_input()
  if state.input_win and vim.api.nvim_win_is_valid(state.input_win) then
    vim.api.nvim_set_current_win(state.input_win)
  end
end

return M
