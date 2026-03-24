local utils = require('bonk.utils')

local M = {}

-- Parse SSE data from curl output lines
local function parse_sse_lines(lines, callbacks)
  local event_type = nil
  local data_buf = ''

  for _, line in ipairs(lines) do
    if line == '' then
      -- Empty line = end of event
      if data_buf ~= '' then
        local parsed = utils.json_decode(data_buf)
        if parsed then
          if event_type == 'token' and callbacks.on_token then
            callbacks.on_token(parsed)
          elseif event_type == 'done' and callbacks.on_done then
            callbacks.on_done(parsed)
          elseif event_type == 'error' and callbacks.on_error then
            callbacks.on_error(parsed)
          elseif event_type == 'tool_use' and callbacks.on_tool_use then
            callbacks.on_tool_use(parsed)
          elseif event_type == 'status' and callbacks.on_status then
            callbacks.on_status(parsed)
          elseif event_type == 'diff' and callbacks.on_diff then
            callbacks.on_diff(parsed)
          end
        end
      end
      event_type = nil
      data_buf = ''
    elseif line:sub(1, 6) == 'event:' then
      event_type = vim.trim(line:sub(7))
    elseif line:sub(1, 5) == 'data:' then
      data_buf = data_buf .. vim.trim(line:sub(6))
    end
  end
end

function M.post_sse(url, body, callbacks)
  local json_body = utils.json_encode(body)
  if not json_body then
    if callbacks.on_error then
      callbacks.on_error({ message = 'Failed to encode request body', code = 'ENCODE_ERROR' })
    end
    return nil
  end

  -- Write body to temp file
  local tmpfile = vim.fn.tempname()
  local f = io.open(tmpfile, 'w')
  if not f then
    if callbacks.on_error then
      callbacks.on_error({ message = 'Failed to create temp file', code = 'IO_ERROR' })
    end
    return nil
  end
  f:write(json_body)
  f:close()

  local line_buf = {}

  local job_id = vim.fn.jobstart({
    'curl',
    '--silent',
    '--no-buffer',
    '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: text/event-stream',
    '-d', '@' .. tmpfile,
    url,
  }, {
    on_stdout = vim.schedule_wrap(function(_, data)
      -- data is a list of lines (may be partial)
      for _, chunk in ipairs(data) do
        if chunk == '' then
          -- Could be SSE event boundary or empty chunk
          table.insert(line_buf, '')
        else
          table.insert(line_buf, chunk)
        end
      end

      -- Try to parse complete events from buffer
      -- Look for double empty lines (SSE event boundary)
      parse_sse_lines(line_buf, callbacks)
      line_buf = {}
    end),
    on_exit = vim.schedule_wrap(function()
      -- Clean up temp file
      os.remove(tmpfile)
      if callbacks.on_complete then
        callbacks.on_complete()
      end
    end),
  })

  return job_id
end

function M.cancel(job_id)
  if job_id and job_id > 0 then
    pcall(vim.fn.jobstop, job_id)
  end
end

function M.post(url, body, callback)
  local json_body = utils.json_encode(body)
  if not json_body then
    if callback then
      callback(false)
    end
    return
  end

  vim.fn.jobstart({
    'curl',
    '--silent',
    '--max-time', '5',
    '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-d', json_body,
    url,
  }, {
    stdout_buffered = true,
    on_stdout = vim.schedule_wrap(function(_, data)
      local result = utils.json_decode(table.concat(data, ''))
      if callback then
        callback(result ~= nil)
      end
    end),
    on_exit = vim.schedule_wrap(function(_, code)
      if code ~= 0 and callback then
        callback(false)
      end
    end),
  })
end

return M
