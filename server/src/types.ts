export interface LockFile {
  pid: number;
  port: number;
  token: string;
  started_at: string;
}

export interface ClientInfo {
  id: string;
  registered_at: number;
  last_seen: number;
}

export interface CursorPosition {
  line: number;
  col: number;
}

export interface OpenBuffer {
  path: string;
  content: string;
}

export interface RecentEdit {
  path: string;
  diff: string;
}

export interface CompleteRequest {
  token: string;
  client_id: string;
  file_path: string;
  filetype: string;
  buffer_content: string;
  cursor: CursorPosition;
  context?: {
    open_buffers?: OpenBuffer[];
    recent_edits?: RecentEdit[];
  };
  options?: {
    model?: string;
    max_tokens?: number;
    context_budget?: number;
  };
}

export interface SSETokenEvent {
  type: 'token';
  text: string;
}

export interface SSEDoneEvent {
  type: 'done';
  full_text: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
  code: string;
}

export type SSEEvent = SSETokenEvent | SSEDoneEvent | SSEErrorEvent;

// Chat types

export interface ChatSelection {
  start: CursorPosition;
  end: CursorPosition;
  text: string;
}

export interface ChatMention {
  type: 'file';
  path: string;
}

export interface ChatContext {
  file_path?: string;
  filetype?: string;
  selection?: ChatSelection;
  mentions?: ChatMention[];
}

export interface ChatRequest {
  token: string;
  client_id: string;
  session_id?: string;
  message: string;
  context?: ChatContext;
  options?: {
    model?: string;
  };
}

