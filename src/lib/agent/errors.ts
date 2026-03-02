/**
 * Structured error classification for agent API errors.
 */

export type AgentErrorType =
  | "rate_limit"
  | "auth"
  | "context_overflow"
  | "network"
  | "provider_error"
  | "unknown";

export interface AgentError {
  type: AgentErrorType;
  message: string;
  retryAfter?: number; // seconds
  details?: string;
}

/**
 * Classify an error from a provider API call into a structured AgentError.
 */
export function classifyError(err: unknown): AgentError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // Rate limiting
  if (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  ) {
    const retryAfter = extractRetryAfter(message);
    return {
      type: "rate_limit",
      message: "Rate limited by the provider.",
      retryAfter,
      details: message,
    };
  }

  // Auth errors
  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("authentication") ||
    lower.includes("permission denied")
  ) {
    return {
      type: "auth",
      message: "Authentication error. Check your API key.",
      details: message,
    };
  }

  // Context overflow
  if (
    lower.includes("context length") ||
    lower.includes("context_length") ||
    lower.includes("maximum context") ||
    lower.includes("token limit") ||
    lower.includes("too many tokens") ||
    lower.includes("max_tokens") ||
    lower.includes("context window")
  ) {
    return {
      type: "context_overflow",
      message: "Context too large for the model.",
      details: message,
    };
  }

  // Network errors
  if (
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("socket hang up") ||
    lower.includes("dns") ||
    err instanceof TypeError // fetch throws TypeError on network failure
  ) {
    return {
      type: "network",
      message: "Network error. Please check your connection.",
      details: message,
    };
  }

  // Provider-specific errors (non-retryable)
  if (
    lower.includes("400") ||
    lower.includes("bad request") ||
    lower.includes("invalid_request") ||
    lower.includes("overloaded") ||
    lower.includes("500") ||
    lower.includes("503")
  ) {
    return {
      type: "provider_error",
      message: `Provider error: ${message.slice(0, 200)}`,
      details: message,
    };
  }

  return {
    type: "unknown",
    message: message.slice(0, 300),
    details: message,
  };
}

/** Try to extract a retry-after value (in seconds) from error messages */
function extractRetryAfter(message: string): number | undefined {
  // Look for patterns like "retry after 30s", "retry-after: 30", "wait 60 seconds"
  const patterns = [
    /retry[- ]?after[:\s]*(\d+)/i,
    /wait\s+(\d+)\s*s/i,
    /(\d+)\s*seconds?\s*(?:until|before|to)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

/** Format an AgentError for the client-side response */
export function formatErrorResponse(error: AgentError): {
  error: string;
  errorType: AgentErrorType;
  retryAfter?: number;
  details?: string;
} {
  return {
    error: error.message,
    errorType: error.type,
    ...(error.retryAfter && { retryAfter: error.retryAfter }),
    ...(error.details && { details: error.details }),
  };
}
