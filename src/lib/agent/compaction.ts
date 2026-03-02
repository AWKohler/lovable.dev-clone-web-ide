/**
 * Context window compaction — summarize older messages to stay within token limits.
 */

import type { ModelMessage } from "ai";
import { MODEL_CONFIGS, type ModelId } from "./models";
import { agentLog } from "./logger";

/**
 * Rough token count estimation.
 * Uses ~4 chars per token heuristic (works reasonably for English text).
 * Not perfect but avoids adding a tiktoken dependency.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a full messages array */
export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          total += estimateTokens(part.text);
        } else {
          // Tool calls, tool results, etc — estimate from JSON
          total += estimateTokens(JSON.stringify(part));
        }
      }
    }
    // Per-message overhead (role, formatting)
    total += 4;
  }
  return total;
}

/** Check if context needs compaction based on model limits */
export function needsCompaction(
  systemPromptTokens: number,
  messagesTokens: number,
  toolsTokens: number,
  model: ModelId
): boolean {
  const config = MODEL_CONFIGS[model];
  const totalTokens = systemPromptTokens + messagesTokens + toolsTokens;
  const threshold = config.maxContextTokens * 0.8; // Compact at 80%
  return totalTokens > threshold;
}

/**
 * Compact messages by summarizing older messages while keeping recent ones.
 *
 * Strategy:
 * - Keep the last `keepRecent` message pairs (user + assistant)
 * - Keep all pending tool results
 * - Summarize everything else into a single system-style message
 *
 * This is a local summarization (no LLM call) to avoid complexity.
 * It extracts key information from older messages.
 */
export function compactMessages(
  messages: ModelMessage[],
  keepRecent: number = 6
): { compacted: ModelMessage[]; summarizedCount: number } {
  if (messages.length <= keepRecent) {
    return { compacted: messages, summarizedCount: 0 };
  }

  const olderMessages = messages.slice(0, messages.length - keepRecent);
  const recentMessages = messages.slice(messages.length - keepRecent);

  // Build a summary of older messages
  const summaryParts: string[] = ["[Conversation Summary - older messages compacted to save context]"];

  let userMsgCount = 0;
  let assistantMsgCount = 0;
  const toolsUsed = new Set<string>();
  const filesModified = new Set<string>();
  const keyTopics: string[] = [];

  for (const msg of olderMessages) {
    if (msg.role === "user") {
      userMsgCount++;
      const text = extractText(msg);
      if (text.length > 0) {
        // Capture first line as topic
        const firstLine = text.split("\n")[0].slice(0, 100);
        if (firstLine.trim()) keyTopics.push(`- User: ${firstLine}`);
      }
    } else if (msg.role === "assistant") {
      assistantMsgCount++;
      // Extract tool call names
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if ("type" in part && part.type === "tool-call" && "toolName" in part) {
            toolsUsed.add(part.toolName as string);
          }
        }
      }
    } else if (msg.role === "tool") {
      // Extract file paths from tool results
      const text = extractText(msg);
      const pathMatches = text.match(/\/[\w/.-]+\.\w+/g);
      if (pathMatches) {
        for (const p of pathMatches.slice(0, 10)) {
          filesModified.add(p);
        }
      }
    }
  }

  summaryParts.push(`\nPrevious conversation: ${userMsgCount} user messages, ${assistantMsgCount} assistant responses.`);

  if (toolsUsed.size > 0) {
    summaryParts.push(`Tools used: ${[...toolsUsed].join(", ")}`);
  }

  if (filesModified.size > 0) {
    summaryParts.push(`Files referenced: ${[...filesModified].slice(0, 15).join(", ")}`);
  }

  if (keyTopics.length > 0) {
    summaryParts.push(`\nKey topics discussed:`);
    summaryParts.push(...keyTopics.slice(0, 10));
  }

  const summaryMessage: ModelMessage = {
    role: "user",
    content: summaryParts.join("\n"),
  };

  const compacted = [summaryMessage, ...recentMessages];

  agentLog.compaction({
    beforeTokens: estimateMessagesTokens(messages),
    afterTokens: estimateMessagesTokens(compacted),
    messagesSummarized: olderMessages.length,
  });

  return { compacted, summarizedCount: olderMessages.length };
}

function extractText(msg: ModelMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p): p is { type: "text"; text: string } => "type" in p && p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}
