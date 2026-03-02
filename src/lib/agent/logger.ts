/**
 * Structured logger for agent operations.
 * Outputs JSON-formatted logs parseable in Vercel/terminal.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  requestId?: string;
  model?: string;
  durationMs?: number;
  tokenCount?: number;
  error?: string;
  [key: string]: unknown;
}

let currentRequestId: string | undefined;

export function setRequestId(id: string) {
  currentRequestId = id;
}

function log(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg,
    ...(currentRequestId && { requestId: currentRequestId }),
    ...extra,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "debug":
      console.debug(`[agent] ${line}`);
      break;
    case "info":
      console.log(`[agent] ${line}`);
      break;
    case "warn":
      console.warn(`[agent] ${line}`);
      break;
    case "error":
      console.error(`[agent] ${line}`);
      break;
  }
}

export const agentLog = {
  debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),

  /** Log an API call to an LLM provider */
  apiCall(params: { model: string; tokenCount: number; messageCount: number }) {
    log("info", "llm_api_call", params);
  },

  /** Log API call completion */
  apiComplete(params: { model: string; durationMs: number; promptTokens?: number; completionTokens?: number }) {
    log("info", "llm_api_complete", params);
  },

  /** Log a tool execution */
  toolExec(params: { tool: string; durationMs: number; success: boolean; error?: string }) {
    log("info", "tool_exec", params);
  },

  /** Log a retry attempt */
  retry(params: { attempt: number; maxRetries: number; error: string; delayMs: number }) {
    log("warn", "retry_attempt", params);
  },

  /** Log context compaction */
  compaction(params: { beforeTokens: number; afterTokens: number; messagesSummarized: number }) {
    log("info", "context_compaction", params);
  },
};

/** Generate a short request ID for tracing */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
