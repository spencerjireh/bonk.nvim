local agent_render = require('bonk.agent_render')
local diff_mod = require('bonk.diff')

describe('agent_render', function()
  before_each(function()
    diff_mod.clear()
  end)

  after_each(function()
    if agent_render.is_open() then
      agent_render.close()
    end
  end)

  it('opens and closes status panel', function()
    agent_render.set_task('test task')
    agent_render.open('test task')
    assert.is_true(agent_render.is_open())

    agent_render.close()
    assert.is_false(agent_render.is_open())
  end)

  it('renders status with task and phase', function()
    agent_render.set_task('my task')
    agent_render.open('my task')
    agent_render.update_status('analyzing', 'Reading files...')

    local buf = vim.fn.bufnr('bonk://agent-status')
    assert.is_true(buf > 0)
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    local content = table.concat(lines, '\n')
    assert.is_truthy(content:find('my task'))
    assert.is_truthy(content:find('analyzing'))
  end)

  it('renders file list after diffs added', function()
    agent_render.set_task('task')
    agent_render.open('task')

    diff_mod.add_diff({
      path = 'test.lua',
      hunks = { { start_line = 1, old_text = 'a', new_text = 'b' } },
    })
    agent_render.update_files()

    local buf = vim.fn.bufnr('bonk://agent-status')
    local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
    local content = table.concat(lines, '\n')
    assert.is_truthy(content:find('test.lua'))
    assert.is_truthy(content:find('1 hunks'))
  end)
end)
