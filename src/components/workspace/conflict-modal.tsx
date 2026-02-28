"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  X,
  AlertTriangle,
  Check,
  Loader2,
  GitMerge,
  ArrowDown,
  Upload,
  FileText,
} from "lucide-react";
import type { ConflictFile } from "@/app/api/projects/[id]/git/pull/route";

export type { ConflictFile };

interface ConflictModalProps {
  mode: "pull" | "push";
  conflicts: ConflictFile[];
  /** Remote-only changes (no local counterpart) — will be auto-applied on merge */
  nonConflictedRemote: Record<string, string | null>;
  /** Called when user chooses to force pull (download full remote tree) */
  onForcePull?: () => void;
  /** Called when user chooses to force push (overwrite remote) */
  onForcePush?: () => void;
  /** Called with per-file resolutions when user completes merge */
  onComplete: (resolutions: Record<string, string | null>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filename(path: string) {
  return path.split("/").pop() ?? path;
}

function dirname(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || "/";
}

// ── Resolution state type ────────────────────────────────────────────────────

type Resolution = "remote" | "local" | "custom";

interface FileResolution {
  choice: Resolution;
  customContent: string;
}

function defaultResolution(f: ConflictFile): FileResolution {
  return {
    choice: "remote",
    customContent: f.remote ?? "",
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ConflictModal({
  mode,
  conflicts,
  nonConflictedRemote,
  onForcePull,
  onForcePush,
  onComplete,
  onCancel,
  isLoading = false,
}: ConflictModalProps) {
  const [selected, setSelected] = useState<number>(0);
  const [resolutions, setResolutions] = useState<FileResolution[]>(
    () => conflicts.map(defaultResolution)
  );

  const currentFile = conflicts[selected];
  const currentRes = resolutions[selected];

  const setChoice = useCallback(
    (i: number, choice: Resolution) => {
      setResolutions((prev) => {
        const next = [...prev];
        const f = conflicts[i];
        next[i] = {
          choice,
          customContent:
            choice === "remote"
              ? f.remote ?? ""
              : choice === "local"
              ? f.local ?? ""
              : next[i].customContent,
        };
        return next;
      });
    },
    [conflicts]
  );

  const setCustomContent = useCallback((i: number, content: string) => {
    setResolutions((prev) => {
      const next = [...prev];
      next[i] = { choice: "custom", customContent: content };
      return next;
    });
  }, []);

  const handleComplete = useCallback(() => {
    const result: Record<string, string | null> = {};
    for (let i = 0; i < conflicts.length; i++) {
      const f = conflicts[i];
      const res = resolutions[i];
      if (res.choice === "remote") {
        result[f.path] = f.remote;
      } else if (res.choice === "local") {
        result[f.path] = f.local;
      } else {
        result[f.path] = res.customContent || null;
      }
    }
    onComplete(result);
  }, [conflicts, resolutions, onComplete]);

  const allResolved = resolutions.every((r) => r.choice !== "custom" || r.customContent.trim().length > 0);
  const nonConflictCount = Object.keys(nonConflictedRemote).length;

  const panel = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          "relative flex flex-col",
          "bg-surface border border-border rounded-2xl shadow-2xl",
          "w-[90vw] max-w-5xl",
          "h-[85vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-yellow-500" />
            <span className="text-sm font-semibold">
              {mode === "pull" ? "Pull Conflicts" : "Push Conflicts"}
            </span>
            <span className="text-xs text-muted">
              {conflicts.length} file{conflicts.length !== 1 ? "s" : ""} to resolve
              {nonConflictCount > 0 && (
                <span className="ml-2 opacity-70">
                  · {nonConflictCount} auto-applied
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-soft/60 transition-colors text-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar: file list */}
          <div className="w-56 border-r border-border flex flex-col shrink-0 overflow-y-auto modern-scrollbar">
            <div className="px-3 py-2 text-[10px] font-medium text-muted uppercase tracking-wider border-b border-border/60">
              Conflicted Files
            </div>
            {conflicts.map((f, i) => {
              const res = resolutions[i];
              const resolved =
                res.choice === "remote" ||
                res.choice === "local" ||
                (res.choice === "custom" && res.customContent.trim().length > 0);

              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5 text-left transition-colors border-b border-border/40",
                    i === selected
                      ? "bg-accent/10 text-foreground"
                      : "hover:bg-soft/40 text-muted hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 w-3 h-3 rounded-full border shrink-0 flex items-center justify-center",
                      resolved
                        ? "border-green-500 bg-green-500/20"
                        : "border-yellow-500 bg-yellow-500/10"
                    )}
                  >
                    {resolved && <Check size={7} className="text-green-500" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate">
                      {filename(f.path)}
                    </span>
                    <span className="block text-[10px] opacity-60 truncate">
                      {dirname(f.path)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right panel: diff + resolution */}
          {currentFile ? (
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              {/* File path header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 shrink-0 bg-elevated/30">
                <FileText size={12} className="text-muted" />
                <span className="text-xs text-muted font-mono truncate">
                  {currentFile.path}
                </span>
              </div>

              {/* Diff columns */}
              <div className="flex flex-1 min-h-0 border-b border-border/60">
                {/* Remote side */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-border/60">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/5 border-b border-border/40 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 opacity-70" />
                    <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider">
                      Remote (HEAD)
                    </span>
                  </div>
                  {currentFile.remote === null ? (
                    <div className="flex items-center justify-center flex-1 text-xs text-muted opacity-60">
                      File deleted on remote
                    </div>
                  ) : (
                    <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono leading-relaxed text-foreground/80 modern-scrollbar whitespace-pre">
                      {currentFile.remote}
                    </pre>
                  )}
                </div>

                {/* Local side */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/5 border-b border-border/40 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-green-500 opacity-70" />
                    <span className="text-[10px] font-medium text-green-400 uppercase tracking-wider">
                      Local (yours)
                    </span>
                  </div>
                  {currentFile.local === null ? (
                    <div className="flex items-center justify-center flex-1 text-xs text-muted opacity-60">
                      File deleted locally
                    </div>
                  ) : (
                    <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono leading-relaxed text-foreground/80 modern-scrollbar whitespace-pre">
                      {currentFile.local}
                    </pre>
                  )}
                </div>
              </div>

              {/* Merged result */}
              <div className="flex flex-col shrink-0" style={{ height: "35%" }}>
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-elevated/30 shrink-0">
                  <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Resolution
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => setChoice(selected, "remote")}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                        currentRes.choice === "remote"
                          ? "bg-blue-500/20 text-blue-400"
                          : "hover:bg-soft/60 text-muted"
                      )}
                    >
                      Use Remote
                    </button>
                    <button
                      type="button"
                      onClick={() => setChoice(selected, "local")}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                        currentRes.choice === "local"
                          ? "bg-green-500/20 text-green-400"
                          : "hover:bg-soft/60 text-muted"
                      )}
                    >
                      Use Local
                    </button>
                  </div>
                </div>
                <textarea
                  className={cn(
                    "flex-1 resize-none p-3 text-[11px] font-mono leading-relaxed",
                    "bg-bg text-foreground",
                    "focus:outline-none focus:ring-1 focus:ring-accent/40 rounded-none",
                    "modern-scrollbar"
                  )}
                  value={currentRes.customContent}
                  onChange={(e) => setCustomContent(selected, e.target.value)}
                  placeholder={
                    currentFile.remote === null && currentFile.local === null
                      ? "Both sides deleted — leave empty to confirm deletion"
                      : "Edit merged result..."
                  }
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Select a file to resolve
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-border shrink-0 bg-surface">
          {/* Danger actions on left */}
          {mode === "pull" && onForcePull && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
              onClick={onForcePull}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={13} className="animate-spin mr-1" />
              ) : (
                <ArrowDown size={13} className="mr-1" />
              )}
              Force Pull
            </Button>
          )}

          {mode === "push" && onForcePush && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
              onClick={onForcePush}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={13} className="animate-spin mr-1" />
              ) : (
                <Upload size={13} className="mr-1" />
              )}
              Force Push
            </Button>
          )}

          <div className="flex-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleComplete}
            disabled={!allResolved || isLoading}
          >
            {isLoading ? (
              <Loader2 size={13} className="animate-spin mr-1" />
            ) : (
              <GitMerge size={13} className="mr-1" />
            )}
            {mode === "pull" ? "Complete Merge" : "Resolve & Push"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
