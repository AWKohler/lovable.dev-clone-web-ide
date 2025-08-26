'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { WebContainerAgent, type GrepResult } from '@/lib/agent/webcontainer-agent';
import { cn } from '@/lib/utils';

type Props = { className?: string };

export function AgentPanel({ className }: Props) {
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, addToolResult, stop, isLoading } = useChat({
    api: '/api/agent',
    onFinish: () => setBusy(false),
    onError: () => setBusy(false),
    async onToolCall({ toolCall }) {
      try {
        const args = toolCall.args as Record<string, unknown>;
        switch (toolCall.toolName) {
          case 'listFiles': {
            console.log("list files called")
            const out = await WebContainerAgent.listFiles(
              String(args.path ?? '/'),
              Boolean(args.recursive)
            );
            await addToolResult({ toolCallId: toolCall.toolCallId, result: out });
            break;
          }
          case 'readFile': {
            console.log("read files called")
            const out = await WebContainerAgent.readFile(String(args.path ?? ''));
            await addToolResult({ toolCallId: toolCall.toolCallId, result: out });
            break;
          }
          case 'applyDiff': {
            console.log("apply diff called")
            const res = await WebContainerAgent.applyDiff(
              String(args.path ?? ''),
              String(args.diff ?? '')
            );
            await addToolResult({ toolCallId: toolCall.toolCallId, result: JSON.stringify(res) });
            break;
          }
          case 'searchFiles': {
            console.log("search files called")
            const results: GrepResult[] = [];
            for await (const r of WebContainerAgent.searchFiles(
              String(args.path ?? '/'),
              String(args.query ?? '')
            )) {
              results.push(r);
            }
            await addToolResult({ toolCallId: toolCall.toolCallId, result: JSON.stringify(results) });
            break;
          }
          case 'executeCommand': {
            console.log("execute command called")
            let combined = '';
            const cmd = String(args.command ?? '');
            const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : [];
            for await (const chunk of WebContainerAgent.executeCommand(cmd, cmdArgs)) {
              combined += chunk;
            }
            await addToolResult({ toolCallId: toolCall.toolCallId, result: combined });
            break;
          }
        }
      } catch (err: unknown) {
        console.error('Tool error', err);
        const message = err instanceof Error ? err.message : String(err);
        await addToolResult({ toolCallId: toolCall.toolCallId, result: `Tool execution failed: ${message}` });
      }
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const placeholder = useMemo(
    () =>
      'Ask me to inspect files, propose changes as diffs, run dev, etc. For edits, I use SEARCH/REPLACE blocks.',
    []
  );

  return (
    <div className={cn('flex h-full flex-col text-sm', className)}>
      <div ref={scrollRef} className="flex-1 overflow-auto space-y-3 pr-1">
        {messages.map((m) => {
          type TextPart = { type: 'text'; text: string };
          type ToolCallPart = { type: 'tool-call'; toolCall: unknown };
          type DataPart = { type: 'data'; data: unknown };
          type UiPart = TextPart | ToolCallPart | DataPart | Record<string, unknown>;

          const content = (m as { content: unknown }).content;
          return (
            <div key={m.id} className={cn('rounded-md px-2 py-2', m.role === 'user' ? 'bg-slate-800/80' : 'bg-slate-900/60') }>
              <div className="text-xs mb-1 text-slate-400 uppercase tracking-wide">{m.role}</div>
              {Array.isArray(content) ? (
                (content as UiPart[]).map((part, i: number) => {
                  if ((part as TextPart).type === 'text' && typeof (part as TextPart).text === 'string') {
                    return <p key={i} className="whitespace-pre-wrap leading-relaxed">{(part as TextPart).text}</p>;
                  }
                  if ((part as ToolCallPart).type === 'tool-call') {
                    return <pre key={i} className="text-xs overflow-auto bg-black/30 p-2 rounded">{JSON.stringify((part as ToolCallPart).toolCall, null, 2)}</pre>;
                  }
                  if ((part as DataPart).type === 'data') {
                    return <pre key={i} className="text-xs overflow-auto bg-black/30 p-2 rounded">{JSON.stringify((part as DataPart).data, null, 2)}</pre>;
                  }
                  return <pre key={i} className="text-xs overflow-auto bg-black/30 p-2 rounded">{JSON.stringify(part, null, 2)}</pre>;
                })
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{String(content ?? '')}</p>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="text-xs text-slate-400">Thinking…</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          setBusy(true);
          handleSubmit(e);
        }}
        className="mt-2 flex gap-2"
      >
        <input
          className="flex-1 rounded-md bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
          placeholder={placeholder}
          value={input}
          onChange={handleInputChange}
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy}>
          Send
        </Button>
        {busy && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { stop(); setBusy(false); }}>
            Stop
          </Button>
        )}
      </form>
      <div className="mt-1 text-[11px] text-slate-500">
        Tip: For edits, I apply diffs with SEARCH/REPLACE blocks. If a block fails to match, I’ll ask for a corrected diff.
      </div>
    </div>
  );
}
