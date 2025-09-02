'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { ChevronDown, ChevronRight, Wrench, ArrowUp, X as IconX } from 'lucide-react';
import { WebContainerAgent, type GrepResult } from '@/lib/agent/webcontainer-agent';
import { cn } from '@/lib/utils';
import { LiveActions } from '@/components/agent/LiveActions';
import type { ToolCallData } from '@/lib/agent/ui-types';
import { diffLineStats } from '@/lib/agent/diff-stats';

type Props = { className?: string; projectId: string; initialPrompt?: string; platform?: 'web' | 'mobile' };

function ToolCard({ title, meta, content, defaultOpen = false }: { title: string; meta?: string; content: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg bg-soft">
      <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2 text-sm">
          <Wrench size={14} className="text-accent" />
          <span className="font-medium text-fg">{title}</span>
          {meta && <span className="text-muted">{meta}</span>}
        </div>
        {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
      </div>
      {open && <div className="px-3 pb-3">{content}</div>}
    </div>
  );
}

export function AgentPanel({ className, projectId, initialPrompt, platform = 'web' }: Props) {
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedIdsRef = useRef<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [actions, setActions] = useState<ToolCallData[]>([]);
  // Track last-saved assistant payload to allow streaming upserts
  const lastAssistantSavedRef = useRef<{ id: string; hash: string } | null>(null);

  const { messages, input, handleSubmit, handleInputChange, status, setMessages, addToolResult, setInput, stop } = useChat({
    api: '/api/agent',
    body: { projectId, platform },
    async onFinish(message) {
      // Persist final assistant message (complete content, including any tool-calls)
      try {
        await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, message }),
        });
        savedIdsRef.current.add(message.id);
      } catch (err) {
        console.error('Failed to persist assistant message:', err);
      }
      setBusy(false);
    },
    onError: () => setBusy(false),
    async onToolCall({ toolCall }) {
      try {
        const args = toolCall.args as Record<string, unknown>;
        // Ephemeral: record tool invocation
        setActions((prev) => [
          ...prev,
          {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args,
            status: 'invoked',
            startedAt: Date.now(),
          },
        ]);
        switch (toolCall.toolName) {
          case 'listFiles': {
            console.log("list files called")
            const out = await WebContainerAgent.listFiles(
              String(args.path ?? '/'),
              Boolean(args.recursive)
            );
            await addToolResult({ toolCallId: toolCall.toolCallId, result: out });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: 'success',
              finishedAt: Date.now(),
              resultPreview: out.slice(0, 400),
            }) : a));
            break;
          }
          case 'readFile': {
            console.log("read files called")
            const out = await WebContainerAgent.readFile(String(args.path ?? ''));
            await addToolResult({ toolCallId: toolCall.toolCallId, result: out });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: 'success',
              finishedAt: Date.now(),
              resultPreview: out.slice(0, 400),
            }) : a));
            break;
          }
          case 'applyDiff': {
            console.log("apply diff called")
            const path = String(args.path ?? '');
            const diff = String(args.diff ?? '');
            // Capture before content for UI
            let before = '';
            try { before = await WebContainerAgent.readFile(path); } catch {}
            const res = await WebContainerAgent.applyDiff(path, diff);
            // Capture after content for UI (only if ok)
            let after = before;
            try { after = await WebContainerAgent.readFile(path); } catch {}
            const stats = diffLineStats(before, after);
            await addToolResult({ toolCallId: toolCall.toolCallId, result: JSON.stringify(res) });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: res.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              fileChange: { filePath: path, before, after, additions: stats.additions, deletions: stats.deletions },
              resultPreview: res.message,
            }) : a));
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
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: 'success',
              finishedAt: Date.now(),
              resultPreview: `${results.length} matches`,
            }) : a));
            break;
          }
          case 'executeCommand': {
            console.log("execute command called")
            console.log(args.command)
            console.log(args.args)
            let combined = '';
            const cmd = String(args.command ?? '');
            const cmdArgs = Array.isArray(args.args) ? (args.args as unknown[]).map(String) : [];
            for await (const chunk of WebContainerAgent.executeCommand(cmd, cmdArgs)) {
              combined += chunk;
            }
            await addToolResult({ toolCallId: toolCall.toolCallId, result: combined });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: 'success',
              finishedAt: Date.now(),
              resultPreview: combined.slice(0, 400),
            }) : a));
            break;
          }
        }
      } catch (err: unknown) {
        console.error('Tool error', err);
        const message = err instanceof Error ? err.message : String(err);
        await addToolResult({ toolCallId: toolCall.toolCallId, result: `Tool execution failed: ${message}` });
        setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
          ...a,
          status: 'error',
          finishedAt: Date.now(),
          resultPreview: message,
        }) : a));
      }
    },
  });

  // Remove only the "prompt" query param from the URL without reloading
  const removePromptFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('prompt')) {
        url.searchParams.delete('prompt');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch {}
  };

  // Convert status to isLoading for backward compatibility
  const isLoading = status === 'streaming' || status === 'submitted';

  // Load initial chat history
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/chat?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error('Failed to load chat');
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data?.messages)) {
          setMessages(data.messages);
          // Initialize saved id set to avoid re-saving
          const ids = new Set<string>();
          for (const m of data.messages) ids.add(m.id);
          savedIdsRef.current = ids;
          // Seed assistant hash to avoid immediate redundant upsert
          const lastAssistant = [...data.messages].reverse().find((m) => m.role === 'assistant');
          if (lastAssistant) {
            try {
              lastAssistantSavedRef.current = { id: lastAssistant.id, hash: JSON.stringify(lastAssistant.content).slice(-512) };
            } catch {
              lastAssistantSavedRef.current = { id: lastAssistant.id, hash: String(lastAssistant.content) };
            }
          }
        }
      } catch (err) {
        console.warn('No existing chat or failed to load:', err);
      } finally {
        if (!cancelled) setInitialized(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, setMessages]);

  // Persist new messages from user/tool/etc. Also upsert assistant progressively.
  useEffect(() => {
    async function persistNewMessages() {
      for (const m of messages) {
        // Progressive upsert for assistant so refreshes preserve context
        if (m.role === 'assistant') {
          const hash = (() => {
            try { return JSON.stringify(m.content).slice(-512); } catch { return String(m.content); }
          })();
          const prev = lastAssistantSavedRef.current;
          if (!prev || prev.id !== m.id || prev.hash !== hash) {
            try {
              await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, message: m }),
              });
              lastAssistantSavedRef.current = { id: m.id, hash };
            } catch (err) {
              console.error('Failed to upsert assistant message:', err);
            }
          }
          continue;
        }

        // One-shot insert for non-assistant roles
        if (!savedIdsRef.current.has(m.id)) {
          try {
            await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, message: m }),
            });
            savedIdsRef.current.add(m.id);
          } catch (err) {
            console.error('Failed to persist message:', err);
          }
        }
      }
    }
    // Avoid running before we’ve loaded existing history
    if (initialized) void persistNewMessages();
  }, [messages, projectId, initialized]);

  useEffect(() => {
    // If an initial prompt exists, submit it once on mount
    if (initialPrompt && !initialized && messages.length === 0) {
      setInput(initialPrompt);
      // submit on next tick so input state is applied
      setTimeout(() => {
        // Call handleSubmit with a synthetic event
        handleSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
        removePromptFromUrl();
      }, 0);
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, handleSubmit, initialPrompt, initialized, setInput]);

  // Ensure LiveActions visibility stays pinned to the bottom as actions stream in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions.length]);

  const placeholder = useMemo(
    () =>
            // 'Ask me to inspect files, propose changes as diffs, run dev, etc. For edits, I use SEARCH/REPLACE blocks.',

      'Ask Huggable...',
    []
  );

  return (
    <div className={cn('flex h-full flex-col text-sm bg-surface text-fg p-2.5', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-surface">
        <div className="text-xs uppercase tracking-wide text-muted">Agent</div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            const confirmed = window.confirm('Reset chat? This will permanently delete all messages for this project.');
            if (!confirmed) return;
            try {
              await fetch(`/api/chat?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
              savedIdsRef.current.clear();
              lastAssistantSavedRef.current = null;
              setMessages([]);
            } catch (err) {
              console.error('Failed to reset chat:', err);
            }
          }}
        >
          Reset
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto space-y-3 p-3 modern-scrollbar">
        {messages.map((m) => {
          type TextPart = { type: 'text'; text: string };
          type ToolCallPart = { type: 'tool-call'; toolCall: unknown };
          type DataPart = { type: 'data'; data: unknown };
          type UiPart = TextPart | ToolCallPart | DataPart | Record<string, unknown>;

          const content = (m as { content: unknown }).content;
          return (
            <div key={m.id} className={cn('rounded-xl px-2 py-3 text-[1.1rem] tracking tight', m.role === 'user' ? 'bg-elevated' : '') }>
              {/* <div className="text-[11px] mb-1 text-muted uppercase tracking-wide">{m.role}</div> */}
              {Array.isArray(content) ? (
                (content as UiPart[]).map((part, i: number) => {
                  if ((part as TextPart).type === 'text' && typeof (part as TextPart).text === 'string') {
                    return <Markdown key={i} content={(part as TextPart).text} />;
                  }
                  if ((part as ToolCallPart).type === 'tool-call') {
                    const t = (part as ToolCallPart).toolCall as { toolName?: string; args?: unknown };
                    const meta = t?.toolName ? `• ${t.toolName}` : undefined;
                    return (
                      <ToolCard
                        key={i}
                        title="Tool Call"
                        meta={meta}
                        content={
                          <pre className="text-xs overflow-auto bg-surface p-2 rounded border border-border">
                            {JSON.stringify(t?.args ?? t, null, 2)}
                          </pre>
                        }
                      />
                    );
                  }
                  if ((part as DataPart).type === 'data') {
                    const data = (part as DataPart).data;
                    return (
                      <ToolCard
                        key={i}
                        title="Tool Result"
                        content={
                          typeof data === 'string' ? (
                            <pre className="text-xs overflow-auto bg-surface p-2 rounded border border-border whitespace-pre-wrap">{data}</pre>
                          ) : (
                            <pre className="text-xs overflow-auto bg-surface p-2 rounded border border-border">{JSON.stringify(data, null, 2)}</pre>
                          )
                        }
                        defaultOpen={false}
                      />
                    );
                  }
                  return <pre key={i} className="text-xs overflow-auto bg-soft p-2 rounded border border-border">{JSON.stringify(part, null, 2)}</pre>;
                })
              ) : (
                <Markdown content={String(content ?? '')} />
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="text-xs text-muted">Thinking…</div>
        )}
        <LiveActions
          actions={actions}
          onClear={() => setActions([])}
        />
      </div>

      <form
        onSubmit={(e) => {
          setBusy(true);
          handleSubmit(e);
          removePromptFromUrl();
        }}
        className="group flex flex-col gap-2 rounded-2xl border border-border bg-elevated p-4 transition-colors duration-150 ease-in-out relative mt-2"
      >
        <div data-state="closed" style={{ cursor: 'text' }}>
          <div className="relative flex flex-1 items-center">
            <textarea
              className="flex w-full ring-offset-background placeholder:text-muted focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none text-[16px] leading-snug placeholder-shown:text-ellipsis placeholder-shown:whitespace-nowrap md:text-base focus-visible:ring-0 focus-visible:ring-offset-0 max-h-[200px] bg-transparent focus:bg-transparent flex-1 m-1 rounded-md p-0"
              id="chatinput"
              placeholder={placeholder}
              maxLength={50000}
              style={{ minHeight: 40, height: 40 }}
              value={input}
              onChange={handleInputChange}
              disabled={busy}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* File upload input, hidden for now */}
          <input id="file-upload" className="hidden" accept="image/jpeg,.jpg,.jpeg,image/png,.png,image/webp,.webp" multiple tabIndex={-1} type="file" style={{ border: 0, clip: 'rect(0px, 0px, 0px, 0px)', clipPath: 'inset(50%)', height: 1, margin: '0px -1px -1px 0px', overflow: 'hidden', padding: 0, position: 'absolute', width: 1, whiteSpace: 'nowrap' }} />
          {/* Example tool button, not functional here */}
          {/* <button type="button" className="flex size-6 items-center justify-center rounded-full border border-border text-muted outline-none duration-150 ease-out shrink-0 transition-colors hover:bg-muted-hover" tabIndex={-1}>
            <ChevronRight size={16} />
          </button> */}
          <div className="ml-auto flex items-center gap-1">
            {/* Chat button, not functional here */}
            {/* <button type="button" className="items-center justify-center whitespace-nowrap text-sm transition-colors duration-100 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-elevated shadow-sm px-3 flex h-6 gap-1 rounded-full border py-0 pl-1.5 pr-2.5 font-normal text-muted border-border hover:bg-transparent md:hover:bg-accent md:hover:text-muted-foreground" tabIndex={-1}>
              <ChevronDown size={16} /> Chat
            </button> */}
            <div className="flex items-center gap-1">
              {busy ? (
                <button
                  id="chatinput-stop-button"
                  type="button"
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 ease-out'
                  )}
                  onClick={() => { stop(); setBusy(false); }}
                  title="Stop"
                  aria-label="Stop"
                >
                  <IconX size={18} />
                </button>
              ) : (
                <button
                  id="chatinput-send-message-button"
                  type="submit"
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity duration-150 ease-out',
                    !input.trim() ? 'disabled:cursor-not-allowed disabled:opacity-50 opacity-50' : ''
                  )}
                  disabled={!input.trim()}
                  title="Send"
                  aria-label="Send"
                >
                  <ArrowUp size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
        {/* When busy, the stop control replaces the send button above */}
      </form>
      {/* <div className="mt-1 text-[11px] text-muted">
        Tip: For edits, I apply diffs with SEARCH/REPLACE blocks. If a block fails to match, I’ll ask for a corrected diff.
      </div> */}
    </div>
  );
}
