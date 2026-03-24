local chat_render = require('bonk.chat_render')

describe('chat_render', function()
  after_each(function()
    if chat_render.is_open() then
      chat_render.close_panel()
    end
  end)

  it('panel opens and closes', function()
    chat_render.create_panel()
    assert.is_true(chat_render.is_open())

    chat_render.close_panel()
    assert.is_false(chat_render.is_open())
  end)

  it('append_user_message adds blockquote lines', function()
    chat_render.create_panel()
    chat_render.append_user_message('hello world')

    -- Read the display buffer content
    local buf = vim.fn.bufnr('bonk://chat')
    assert.is_true(buf > 0)
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    local content = table.concat(lines, '\n')
    assert.is_truthy(content:find('> hello world'))
  end)

  it('append_token adds text', function()
    chat_render.create_panel()
    chat_render.start_assistant_response()
    chat_render.append_token('hello ')
    chat_render.append_token('world')

    local buf = vim.fn.bufnr('bonk://chat')
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    local content = table.concat(lines, '\n')
    assert.is_truthy(content:find('hello world'))
  end)

  it('clear empties the buffer', function()
    chat_render.create_panel()
    chat_render.append_user_message('test')
    chat_render.clear()

    local buf = vim.fn.bufnr('bonk://chat')
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    assert.are.equal(1, #lines)
    assert.are.equal('', lines[1])
  end)

  it('get_source_buf returns original buffer', function()
    local original_buf = vim.api.nvim_get_current_buf()
    chat_render.create_panel()
    assert.are.equal(original_buf, chat_render.get_source_buf())
  end)
end)
