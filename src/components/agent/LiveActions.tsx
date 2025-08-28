"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCallData } from '@/lib/agent/ui-types';
import { ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';

type Props = {
  actions: ToolCallData[];
  onClear?: () => void;
  className?: string;
};

export function LiveActions({ actions, onClear, className }: Props) {
  if (!actions.length) return null;

  const fileActions = actions.filter((a) => Boolean(a.fileChange));
  const totals = useMemo(() => (
    fileActions.reduce(
      (acc, a) => {
        acc.files += 1;
        acc.additions += a.fileChange!.additions;
        acc.deletions += a.fileChange!.deletions;
        return acc;
      },
      { files: 0, additions: 0, deletions: 0 }
    )
  ), [fileActions]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll to bottom on new actions so latest is visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight; // jump to bottom
  }, [actions.length]);

  return (
    <div className={cn('rounded-lg border border-border bg-elevated p-2 space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium">Live Actions</div>
        {onClear && (
          <button
            className="text-xs text-muted hover:text-fg transition"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} className="modern-scrollbar max-h-40 overflow-auto space-y-2 pr-1">
        {actions.map((a) => (
          <ActionRow key={a.toolCallId} action={a} />
        ))}
      </div>

      {totals.files > 0 && (
        <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-soft px-3 py-2 text-sm">
          <div>
            <span className="mr-2">{totals.files} files changed</span>
            <span className="text-green-500">+{totals.additions}</span>
            <span className="mx-1"> </span>
            <span className="text-red-500">-{totals.deletions}</span>
          </div>
          <span className="text-muted text-xs">View changes below</span>
        </div>
      )}
    </div>
  );
}

function ActionRow({ action }: { action: ToolCallData }) {
  const [open, setOpen] = useState(false);
  const loading = action.status === 'invoked';
  const isEdit = Boolean(action.fileChange);

  return (
    <div className={cn('rounded-md border border-border bg-surface bolt-fade-in')}> 
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm min-w-0">
          {loading ? (
            <Loader2 className="animate-spin text-muted" size={14} />
          ) : (
            <FileText size={14} className={cn(isEdit ? 'text-accent' : 'text-muted')} />
          )}
          <span className="font-medium">
            {isEdit ? 'Edited' : action.toolName}
          </span>
          {isEdit && (
            <span className="text-muted">
              {action.fileChange!.filePath}
            </span>
          )}
          {isEdit && (
            <span className="ml-2">
              <span className="text-green-500">+{action.fileChange!.additions}</span>
              <span className="mx-1"> </span>
              <span className="text-red-500">-{action.fileChange!.deletions}</span>
            </span>
          )}
          {!isEdit && action.resultPreview && (
            <span className="truncate max-w-[260px] text-muted">{action.resultPreview}</span>
          )}
        </div>
        {open ? (
          <ChevronDown size={14} className="text-muted" />
        ) : (
          <ChevronRight size={14} className="text-muted" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {isEdit ? (
            <FileChange before={action.fileChange!.before} after={action.fileChange!.after} />
          ) : (
            <pre className="text-xs overflow-auto bg-soft p-2 pr-4 rounded border border-border whitespace-pre-wrap break-words">{action.resultPreview ?? ''}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function FileChange({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="text-xs mb-1 text-muted">Before</div>
        <pre className="text-xs overflow-auto bg-soft p-2 pr-4 rounded border border-border whitespace-pre">{before}</pre>
      </div>
      <div>
        <div className="text-xs mb-1 text-muted">After</div>
        <pre className="text-xs overflow-auto bg-soft p-2 pr-4 rounded border border-border whitespace-pre">{after}</pre>
      </div>
    </div>
  );
}
