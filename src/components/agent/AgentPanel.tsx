'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { ChevronDown, ChevronRight, Wrench, ArrowUp, X as IconX, Cog } from 'lucide-react';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { WebContainerAgent, type GrepResult } from '@/lib/agent/webcontainer-agent';
import { cn } from '@/lib/utils';
import { LiveActions } from '@/components/agent/LiveActions';
import { useToast } from '@/components/ui/toast';
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
  const [model, setModel] = useState<
    'gpt-4.1' | 'claude-sonnet-4.6' | 'claude-haiku-4.5' | 'claude-opus-4.6' | 'kimi-k2-thinking-turbo' | 'fireworks-minimax-m2p5'
  >('gpt-4.1');
  const [hasOpenAIKey, setHasOpenAIKey] = useState<boolean | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null);
  const [hasClaudeOAuth, setHasClaudeOAuth] = useState<boolean | null>(null);
  const [hasMoonshotKey, setHasMoonshotKey] = useState<boolean | null>(null);
  const [hasFireworksKey, setHasFireworksKey] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();

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

      // Emit event to trigger snapshot capture
      if (typeof window !== 'undefined') {
        console.log('🚀 Dispatching agent-turn-finished event for project:', projectId);
        window.dispatchEvent(new CustomEvent('agent-turn-finished', { detail: { projectId } }));
      }
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
          case 'writeFile': {
            console.log("write file called")
            const path = String(args.path ?? '');
            const content = String(args.content ?? '');
            const res = await WebContainerAgent.writeFile(path, content, projectId);
            await addToolResult({ toolCallId: toolCall.toolCallId, result: JSON.stringify(res) });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: res.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: res.message,
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
            const res = await WebContainerAgent.applyDiff(path, diff, projectId);
            // Capture after content for UI (only if ok)
            let after = before;
            try { after = await WebContainerAgent.readFile(path); } catch {}
            const stats = diffLineStats(before, after);

            // Show user-friendly notification for diff errors
            if (!res.ok) {
              const failedCount = res.failed || 0;
              const appliedCount = res.applied || 0;
              if (failedCount > 0 && appliedCount === 0) {
                toast({
                  title: 'Diff application failed',
                  description: `Could not match content in ${path}. The agent will retry with updated content.`,
                });
              } else if (failedCount > 0) {
                toast({
                  title: 'Partial diff applied',
                  description: `Applied ${appliedCount}/${appliedCount + failedCount} changes to ${path}. Some blocks failed to match.`,
                });
              }
            }

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
            let lastProgress = '';
            for await (const r of WebContainerAgent.searchFiles(
              String(args.path ?? '/'),
              String(args.query ?? '')
            )) {
              // Check if it's a progress/error message or actual result
              if ('filePath' in r && 'lineNumber' in r && 'lineContent' in r) {
                results.push(r);
              } else if ('progress' in r || 'error' in r) {
                // Store progress/error messages for logging
                lastProgress = r.progress || r.error || '';
                console.log('Search progress:', lastProgress);
              }
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
          case 'getDevServerLog': {
            const linesBack = Number((args as { linesBack?: number }).linesBack ?? 200);
            const out = await WebContainerAgent.getDevServerLog(linesBack);
            const result = out.ok ? (out.log ?? '') : out.message;
            await addToolResult({ toolCallId: toolCall.toolCallId, result });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: out.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: result.slice(0, 400),
            }) : a));
            break;
          }
          case 'getBrowserLog': {
            const linesBack = Number((args as { linesBack?: number }).linesBack ?? 200);
            const out = await WebContainerAgent.getBrowserLog(linesBack);
            const result = out.ok ? (out.log ?? '') : out.message;
            await addToolResult({ toolCallId: toolCall.toolCallId, result });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: out.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: result.slice(0, 400),
            }) : a));
            break;
          }
          case 'startDevServer': {
            const res = await WebContainerAgent.startDevServer();
            const msg = res.message;
            await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: res.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: msg,
            }) : a));
            break;
          }
          case 'stopDevServer': {
            const res = await WebContainerAgent.stopDevServer();
            const msg = res.message;
            await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: res.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: msg,
            }) : a));
            break;
          }
          case 'refreshPreview': {
            const running = await WebContainerAgent.isDevServerRunning();
            if (!running) {
              const msg = 'Dev server is not running. Start it before refreshing the preview.';
              await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
              setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
                ...a,
                status: 'error',
                finishedAt: Date.now(),
                resultPreview: msg,
              }) : a));
              break;
            }
            try {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('preview-refresh'));
              }
              const msg = 'Preview refresh requested.';
              await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
              setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
                ...a,
                status: 'success',
                finishedAt: Date.now(),
                resultPreview: msg,
              }) : a));
            } catch (e) {
              const msg = `Failed to refresh preview: ${e instanceof Error ? e.message : String(e)}`;
              await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
              setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
                ...a,
                status: 'error',
                finishedAt: Date.now(),
                resultPreview: msg,
              }) : a));
            }
            break;
          }
          case 'convexDeploy': {
            const res = await WebContainerAgent.deployConvex(projectId);
            const msg = res.message;
            await addToolResult({ toolCallId: toolCall.toolCallId, result: msg });
            setActions((prev) => prev.map((a) => a.toolCallId === toolCall.toolCallId ? ({
              ...a,
              status: res.ok ? 'success' : 'error',
              finishedAt: Date.now(),
              resultPreview: msg,
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

  // Load project model and user settings (BYOK presence)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (res.ok) {
          const proj = await res.json();
          if (
            proj?.model === 'gpt-4.1' ||
            proj?.model === 'claude-sonnet-4.6' ||
            proj?.model === 'claude-sonnet-4.5' || // backwards compat
            proj?.model === 'claude-haiku-4.5' ||
            proj?.model === 'claude-opus-4.6' ||
            proj?.model === 'claude-opus-4.5' || // backwards compat
            proj?.model === 'kimi-k2-thinking-turbo' ||
            proj?.model === 'fireworks-minimax-m2p5'
          ) {
            // Migrate stored 4.5 values to 4.6
            const m = proj.model === 'claude-sonnet-4.5' ? 'claude-sonnet-4.6'
              : proj.model === 'claude-opus-4.5' ? 'claude-opus-4.6'
              : proj.model;
            setModel(m);
          }
        }
      } catch {}
      try {
        const s = await fetch('/api/user-settings');
        if (s.ok) {
          const data = await s.json();
          setHasOpenAIKey(Boolean(data?.hasOpenAIKey));
          setHasAnthropicKey(Boolean(data?.hasAnthropicKey));
          setHasClaudeOAuth(Boolean(data?.hasClaudeOAuth));
          setHasMoonshotKey(Boolean(data?.hasMoonshotKey));
          setHasFireworksKey(Boolean(data?.hasFireworksKey));
        }
      } catch {}
    })();
  }, [projectId]);

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

      'Ask Botflow...',
    []
  );

  return (
    <div className={cn('flex h-full flex-col text-sm bg-surface text-fg p-2.5', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-surface">
        <button onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings" className="text-muted hover:text-fg">
          <Cog size={16} />
        </button>
        <div className="flex items-center gap-2">
          <select
            className="bg-elevated border border-border rounded-md px-2 py-1 text-xs text-muted"
            value={model}
            onChange={async (e) => {
              const next = e.target.value as
                | 'gpt-4.1'
                | 'claude-sonnet-4.6'
                | 'claude-haiku-4.5'
                | 'claude-opus-4.6'
                | 'kimi-k2-thinking-turbo'
                | 'fireworks-minimax-m2p5';
              const hasAnthropicCreds = hasAnthropicKey || hasClaudeOAuth;
              const keyChecks = {
                'gpt-4.1': { hasKey: hasOpenAIKey, provider: 'OpenAI' },
                'claude-sonnet-4.6': { hasKey: hasAnthropicCreds, provider: 'Anthropic' },
                'claude-haiku-4.5': { hasKey: hasAnthropicCreds, provider: 'Anthropic' },
                'claude-opus-4.6': { hasKey: hasAnthropicCreds, provider: 'Anthropic' },
                'kimi-k2-thinking-turbo': { hasKey: hasMoonshotKey, provider: 'Moonshot' },
                'fireworks-minimax-m2p5': { hasKey: hasFireworksKey, provider: 'Fireworks AI' }
              } as const;
              const check = keyChecks[next];
              if (check.hasKey === false) {
                toast({ title: 'Missing API key', description: `Please add your ${check.provider} API key in Settings.` });
                e.target.value = model; // revert
                return;
              }
              try {
                const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ model: next }),
                });
                if (res.ok) setModel(next);
                else toast({ title: 'Failed to change model' });
              } catch {
                toast({ title: 'Failed to change model' });
              }
            }}
            title="Model"
          >
            <option value="gpt-4.1">GPT-4.1</option>
            <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
            <option value="claude-haiku-4.5">Claude Haiku 4.5</option>
            <option value="claude-opus-4.6">Claude Opus 4.6</option>
            <option value="kimi-k2-thinking-turbo">Kimi K2 Thinking Turbo</option>
            <option value="fireworks-minimax-m2p5">Fireworks MiniMax-M2.5</option>
          </select>
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
          const usingAnthropic = model === 'claude-sonnet-4.6' || model === 'claude-haiku-4.5' || model === 'claude-opus-4.6';
          const hasAnthropicCreds = hasAnthropicKey || hasClaudeOAuth;
          if ((model === 'gpt-4.1' && hasOpenAIKey === false) || (usingAnthropic && hasAnthropicCreds === false)) {
            e.preventDefault();
            toast({ title: 'Missing API key', description: `Please add your ${model === 'gpt-4.1' ? 'OpenAI' : 'Anthropic'} API key in Settings.` });
            return;
          }
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
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
