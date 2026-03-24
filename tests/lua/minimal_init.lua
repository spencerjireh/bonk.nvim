-- Minimal init for plenary tests
local root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':h:h:h')

-- Add plugin to rtp
vim.opt.rtp:prepend(root)

-- Add plenary to rtp
local plenary_path = root .. '/.deps/plenary.nvim'
if vim.fn.isdirectory(plenary_path) == 1 then
  vim.opt.rtp:prepend(plenary_path)
end

vim.cmd('runtime plugin/plenary.vim')
