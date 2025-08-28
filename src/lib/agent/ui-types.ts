export type ToolStatus = 'invoked' | 'success' | 'error';

export type FileChangeData = {
  filePath: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
};

export type ToolCallData = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  error?: string;
  // For file edits via applyDiff
  fileChange?: FileChangeData;
  // Short text result preview for non-edit tools
  resultPreview?: string;
  startedAt: number;
  finishedAt?: number;
};

