local diff = require('bonk.diff')

describe('diff', function()
  before_each(function()
    diff.clear()
  end)

  describe('add_diff', function()
    it('adds a file with hunks', function()
      diff.add_diff({
        path = 'test.lua',
        hunks = { { start_line = 1, old_text = 'old', new_text = 'new' } },
      })
      local files = diff.get_files()
      assert.are.equal(1, #files)
      assert.are.equal('test.lua', files[1].path)
    end)

    it('replaces hunks for existing file', function()
      diff.add_diff({ path = 'a.lua', hunks = { { start_line = 1, old_text = 'x', new_text = 'y' } } })
      diff.add_diff({ path = 'a.lua', hunks = { { start_line = 2, old_text = 'p', new_text = 'q' } } })
      local files = diff.get_files()
      assert.are.equal(1, #files)
      assert.are.equal(2, files[1].hunks[1].start_line)
    end)

    it('ignores invalid data', function()
      diff.add_diff(nil)
      diff.add_diff({})
      diff.add_diff({ path = 'x' })
      assert.are.equal(0, #diff.get_files())
    end)
  end)

  describe('navigation', function()
    before_each(function()
      diff.add_diff({
        path = 'a.lua',
        hunks = {
          { start_line = 1, old_text = 'a', new_text = 'b' },
          { start_line = 5, old_text = 'c', new_text = 'd' },
        },
      })
      diff.add_diff({
        path = 'b.lua',
        hunks = { { start_line = 1, old_text = 'e', new_text = 'f' } },
      })
    end)

    it('auto-selects first file and hunk', function()
      local cur = diff.get_current()
      assert.is_not_nil(cur)
      assert.are.equal(1, cur.file_index)
      assert.are.equal(1, cur.hunk_index)
    end)

    it('next advances within file then across files', function()
      diff.next()
      local cur = diff.get_current()
      assert.are.equal(1, cur.file_index)
      assert.are.equal(2, cur.hunk_index)

      diff.next()
      cur = diff.get_current()
      assert.are.equal(2, cur.file_index)
      assert.are.equal(1, cur.hunk_index)
    end)

    it('next stays at end', function()
      diff.next()
      diff.next()
      diff.next()
      local cur = diff.get_current()
      assert.are.equal(2, cur.file_index)
      assert.are.equal(1, cur.hunk_index)
    end)

    it('prev moves backwards across files', function()
      diff.next()
      diff.next()
      diff.prev()
      local cur = diff.get_current()
      assert.are.equal(1, cur.file_index)
      assert.are.equal(2, cur.hunk_index)
    end)
  end)

  describe('accept/reject', function()
    before_each(function()
      diff.add_diff({
        path = 'a.lua',
        hunks = {
          { start_line = 1, old_text = 'a', new_text = 'b' },
          { start_line = 3, old_text = 'c', new_text = 'd' },
        },
      })
    end)

    it('marks current hunk as accepted', function()
      diff.accept_current()
      local files = diff.get_files()
      assert.is_true(files[1].accepted[1])
    end)

    it('reject overrides accept', function()
      diff.accept_current()
      diff.reject_current()
      local files = diff.get_files()
      assert.is_nil(files[1].accepted[1])
      assert.is_true(files[1].rejected[1])
    end)

    it('accept_all marks all hunks', function()
      diff.add_diff({ path = 'b.lua', hunks = { { start_line = 1, old_text = 'e', new_text = 'f' } } })
      diff.accept_all()
      local s = diff.get_summary()
      assert.are.equal(3, s.accepted)
      assert.are.equal(0, s.pending)
    end)
  end)

  describe('get_summary', function()
    it('computes correct totals', function()
      diff.add_diff({
        path = 'a.lua',
        hunks = {
          { start_line = 1, old_text = 'a', new_text = 'b' },
          { start_line = 3, old_text = 'c', new_text = 'd' },
        },
      })
      diff.accept_current()
      local s = diff.get_summary()
      assert.are.equal(1, s.total_files)
      assert.are.equal(2, s.total_hunks)
      assert.are.equal(1, s.accepted)
      assert.are.equal(0, s.rejected)
      assert.are.equal(1, s.pending)
    end)
  end)

  describe('clear', function()
    it('resets all state', function()
      diff.add_diff({ path = 'a.lua', hunks = { { start_line = 1, old_text = 'a', new_text = 'b' } } })
      diff.clear()
      assert.are.equal(0, #diff.get_files())
      assert.is_nil(diff.get_current())
    end)
  end)
end)
