"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { WebContainer } from "@webcontainer/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  GitCommit,
  Plus,
  RefreshCw,
  ExternalLink,
  LogOut,
  ChevronDown,
  Check,
  Loader2,
  Lock,
  Globe,
  Upload,
  ArrowDown,
} from "lucide-react";
import { ConflictModal } from "./conflict-modal";
import type { ConflictFile } from "./conflict-modal";
import { downloadRepoToWebContainer } from "@/lib/github";

// ── Types ──────────────────────────────────────────────────────────────────

interface GithubStatus {
  connected: boolean;
  username: string | null;
  avatarUrl: string | null;
}

interface GitStatusResult {
  added: string[];
  modified: string[];
  deleted: string[];
  pendingCommits: Array<{ id: string; message: string; createdAt: string }>;
  hasChanges: boolean;
}

interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  isPrivate?: boolean;
  headSha?: string | null;
}

interface GitHubPanelProps {
  projectId: string;
  webcontainer: WebContainer | null;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  githubRepoOwner?: string | null;
  githubRepoName?: string | null;
  githubDefaultBranch?: string | null;
  onRepoConnected: (owner: string, name: string, branch: string, headSha: string | null) => void;
  onRepoDisconnected: () => void;
}

interface ConflictState {
  mode: "pull" | "push";
  conflicts: ConflictFile[];
  nonConflictedRemote: Record<string, string | null>;
  remoteSha: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".cache",
  "__pycache__", ".venv", "venv", "coverage", ".nyc_output",
]);

async function readAllFiles(
  container: WebContainer,
  path = "/",
  acc: Record<string, string> = {}
): Promise<Record<string, string>> {
  try {
    const entries = await container.fs.readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
      if (entry.isDirectory()) {
        await readAllFiles(container, fullPath, acc);
      } else {
        try {
          const content = await container.fs.readFile(fullPath, "utf-8");
          acc[fullPath] = content;
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return acc;
}

async function applyFilesToWebContainer(
  container: WebContainer,
  files: Record<string, string | null>
) {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      await container.fs.rm(path).catch(() => {});
    } else {
      const dir = path.substring(0, path.lastIndexOf("/"));
      if (dir) await container.fs.mkdir(dir, { recursive: true }).catch(() => {});
      await container.fs.writeFile(path, content);
    }
  }
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ type }: { type: "A" | "M" | "D" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold shrink-0",
        type === "A" && "bg-green-500/20 text-green-600 dark:text-green-400",
        type === "M" && "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
        type === "D" && "bg-red-500/20 text-red-500"
      )}
    >
      {type}
    </span>
  );
}

function FileStatusList({ added, modified, deleted }: { added: string[]; modified: string[]; deleted: string[] }) {
  const all = [
    ...added.map((p) => ({ path: p, type: "A" as const })),
    ...modified.map((p) => ({ path: p, type: "M" as const })),
    ...deleted.map((p) => ({ path: p, type: "D" as const })),
  ];

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted opacity-60">
        <Check size={18} />
        <span className="text-xs">Nothing to commit</span>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {all.map(({ path, type }) => {
        const name = path.split("/").pop() ?? path;
        const dir = path.split("/").slice(0, -1).join("/") || "/";
        return (
          <li key={path} className="flex items-center gap-2 px-3 py-1.5 hover:bg-soft/40 transition-colors">
            <StatusBadge type={type} />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-medium truncate">{name}</span>
              <span className="block text-[10px] text-muted opacity-70 truncate">{dir}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function GitHubPanel({
  projectId,
  webcontainer,
  isOpen,
  onClose,
  anchorRef,
  githubRepoOwner,
  githubRepoName,
  githubDefaultBranch,
  onRepoConnected,
  onRepoDisconnected,
}: GitHubPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  // ── Compute position from anchor button ───────────────────────────────────
  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen, anchorRef]);

  // ── Auth state ────────────────────────────────────────────────────────────
  const [ghStatus, setGhStatus] = useState<GithubStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ── Repo create/connect state ─────────────────────────────────────────────
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [repoCreating, setRepoCreating] = useState(false);
  const [showExistingRepos, setShowExistingRepos] = useState(false);
  const [existingRepos, setExistingRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  // ── Git status state ───────────────────────────────────────────────────────
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);

  // ── Conflict modal state ───────────────────────────────────────────────────
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);

  const hasRepo = Boolean(githubRepoOwner && githubRepoName);

  // ── Fetch GitHub auth status ───────────────────────────────────────────────
  const fetchGhStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/github/status");
      if (res.ok) setGhStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchGhStatus();
  }, [isOpen, fetchGhStatus]);

  // ── Handle GitHub OAuth connect ────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    setAuthLoading(true);
    try {
      const returnTo = `/workspace/${projectId}`;
      const res = await fetch(
        `/api/oauth/github/start?return_to=${encodeURIComponent(returnTo)}`
      );
      if (!res.ok) { setAuthLoading(false); return; }
      const { authUrl } = await res.json() as { authUrl: string };
      window.location.href = authUrl;
    } catch {
      setAuthLoading(false);
    }
  }, [projectId]);

  // ── Handle disconnect ──────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    await fetch("/api/oauth/github/disconnect", { method: "POST" });
    setGhStatus({ connected: false, username: null, avatarUrl: null });
  }, []);

  // ── Fetch git status (only when repo is connected) ─────────────────────────
  const fetchGitStatus = useCallback(async () => {
    if (!webcontainer || !hasRepo) return;
    setStatusLoading(true);
    try {
      const files = await readAllFiles(webcontainer);
      const res = await fetch(`/api/projects/${projectId}/git/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (res.ok) setGitStatus(await res.json());
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }, [webcontainer, hasRepo, projectId]);

  useEffect(() => {
    if (isOpen && hasRepo) fetchGitStatus();
  }, [isOpen, hasRepo, fetchGitStatus]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose, anchorRef]);

  // ── Create repo ────────────────────────────────────────────────────────────
  const handleCreateRepo = useCallback(async () => {
    if (!repoName.trim()) return;
    setRepoCreating(true);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: slugify(repoName), isPrivate }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        alert(err.error);
        return;
      }
      const repo = await res.json() as GitHubRepo;
      await fetch(`/api/projects/${projectId}/github`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repo.owner,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          headSha: repo.headSha,
        }),
      });
      onRepoConnected(repo.owner, repo.name, repo.defaultBranch, repo.headSha ?? null);
      setRepoName("");
    } finally {
      setRepoCreating(false);
    }
  }, [repoName, isPrivate, projectId, onRepoConnected]);

  // ── Load existing repos ────────────────────────────────────────────────────
  const handleShowExisting = useCallback(async () => {
    setShowExistingRepos((v) => !v);
    if (!showExistingRepos && existingRepos.length === 0) {
      setReposLoading(true);
      try {
        const res = await fetch("/api/github/repos");
        if (res.ok) setExistingRepos(await res.json());
      } finally {
        setReposLoading(false);
      }
    }
  }, [showExistingRepos, existingRepos]);

  const handleConnectExisting = useCallback(async (repo: GitHubRepo) => {
    let headSha: string | null = null;
    try {
      const branchRes = await fetch(
        `https://api.github.com/repos/${repo.fullName}/branches/${repo.defaultBranch}`,
        { headers: { Accept: "application/vnd.github.v3+json" } }
      );
      if (branchRes.ok) {
        const b = await branchRes.json() as { commit?: { sha: string } };
        headSha = b.commit?.sha ?? null;
      }
    } catch { /* ignore */ }

    await fetch(`/api/projects/${projectId}/github`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        headSha,
      }),
    });
    onRepoConnected(repo.owner, repo.name, repo.defaultBranch, headSha);
    setShowExistingRepos(false);
  }, [projectId, onRepoConnected]);

  // ── Commit ─────────────────────────────────────────────────────────────────
  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || !webcontainer || !gitStatus) return;
    setCommitting(true);
    try {
      const allFiles = await readAllFiles(webcontainer);
      const changedFiles: Record<string, string | null> = {};
      for (const p of [...(gitStatus.added ?? []), ...(gitStatus.modified ?? [])]) {
        changedFiles[p] = allFiles[p] ?? null;
      }
      for (const p of (gitStatus.deleted ?? [])) {
        changedFiles[p] = null;
      }

      const res = await fetch(`/api/projects/${projectId}/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg.trim(), files: changedFiles }),
      });
      if (res.ok) {
        setCommitMsg("");
        await fetchGitStatus();
      }
    } finally {
      setCommitting(false);
    }
  }, [commitMsg, webcontainer, gitStatus, projectId, fetchGitStatus]);

  // ── Push ───────────────────────────────────────────────────────────────────
  const handlePush = useCallback(async (force = false) => {
    setPushing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });

      if (res.status === 409) {
        const data = await res.json() as {
          conflict: boolean;
          remoteSha: string;
          conflicts: ConflictFile[];
          nonConflictedRemote: Record<string, string | null>;
        };
        setConflictState({
          mode: "push",
          conflicts: data.conflicts,
          nonConflictedRemote: data.nonConflictedRemote,
          remoteSha: data.remoteSha,
        });
        return;
      }

      if (res.ok) {
        const data = await res.json() as { newSha: string };
        onRepoConnected(
          githubRepoOwner!,
          githubRepoName!,
          githubDefaultBranch ?? "main",
          data.newSha
        );
        setConflictState(null);
        await fetchGitStatus();
      } else {
        const err = await res.json() as { error: string };
        alert(err.error);
      }
    } finally {
      setPushing(false);
    }
  }, [projectId, onRepoConnected, githubRepoOwner, githubRepoName, githubDefaultBranch, fetchGitStatus]);

  // ── Pull ───────────────────────────────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (!webcontainer || !hasRepo) return;
    setPulling(true);
    try {
      const localFiles = await readAllFiles(webcontainer);
      const res = await fetch(`/api/projects/${projectId}/git/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", localFiles }),
      });

      const data = await res.json() as {
        nothingToPull?: boolean;
        remoteSha?: string;
        remoteChanges?: Record<string, string | null>;
        conflicts?: ConflictFile[];
        nonConflictedRemote?: Record<string, string | null>;
        error?: string;
      };

      if (!res.ok) {
        alert(data.error ?? "Failed to pull from GitHub");
        return;
      }

      if (data.nothingToPull) {
        // Show brief feedback
        alert("Already up to date.");
        return;
      }

      const conflicts = data.conflicts ?? [];
      const nonConflictedRemote = data.nonConflictedRemote ?? {};
      const remoteSha = data.remoteSha!;

      if (conflicts.length === 0) {
        // No conflicts — apply all remote changes directly
        await applyFilesToWebContainer(webcontainer, data.remoteChanges ?? {});
        await fetch(`/api/projects/${projectId}/git/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "force-update-sha", remoteSha }),
        });
        onRepoConnected(
          githubRepoOwner!,
          githubRepoName!,
          githubDefaultBranch ?? "main",
          remoteSha
        );
        await fetchGitStatus();
      } else {
        setConflictState({ mode: "pull", conflicts, nonConflictedRemote, remoteSha });
      }
    } finally {
      setPulling(false);
    }
  }, [webcontainer, hasRepo, projectId, githubRepoOwner, githubRepoName, githubDefaultBranch, onRepoConnected, fetchGitStatus]);

  // ── Force pull (download full remote tree) ────────────────────────────────
  const handleForcePull = useCallback(async () => {
    if (!webcontainer || !conflictState) return;
    setConflictLoading(true);
    try {
      await downloadRepoToWebContainer(webcontainer, {
        owner: githubRepoOwner!,
        repo: githubRepoName!,
        ref: githubDefaultBranch ?? "main",
      });
      await fetch(`/api/projects/${projectId}/git/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force-update-sha", remoteSha: conflictState.remoteSha }),
      });
      onRepoConnected(
        githubRepoOwner!,
        githubRepoName!,
        githubDefaultBranch ?? "main",
        conflictState.remoteSha
      );
      setConflictState(null);
      await fetchGitStatus();
    } finally {
      setConflictLoading(false);
    }
  }, [webcontainer, conflictState, githubRepoOwner, githubRepoName, githubDefaultBranch, projectId, onRepoConnected, fetchGitStatus]);

  // ── Conflict resolution: complete merge (pull or push) ────────────────────
  const handleConflictComplete = useCallback(
    async (resolutions: Record<string, string | null>) => {
      if (!webcontainer || !conflictState) return;
      setConflictLoading(true);
      try {
        const { mode, nonConflictedRemote, remoteSha } = conflictState;

        // Merged files = resolved conflicts + non-conflicting remote changes
        const mergedFiles: Record<string, string | null> = {
          ...nonConflictedRemote,
          ...resolutions,
        };

        // Apply all merged content to WebContainer
        await applyFilesToWebContainer(webcontainer, mergedFiles);

        if (mode === "pull") {
          // Update tracked SHA
          await fetch(`/api/projects/${projectId}/git/pull`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "force-update-sha", remoteSha }),
          });
          onRepoConnected(
            githubRepoOwner!,
            githubRepoName!,
            githubDefaultBranch ?? "main",
            remoteSha
          );
          setConflictState(null);
          await fetchGitStatus();
        } else {
          // push mode: commit the merge and force push
          const commitRes = await fetch(`/api/projects/${projectId}/git/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: "Merge remote changes",
              files: mergedFiles,
            }),
          });

          if (commitRes.ok) {
            await handlePush(true); // force push
          }
        }
      } finally {
        setConflictLoading(false);
      }
    },
    [webcontainer, conflictState, projectId, githubRepoOwner, githubRepoName, githubDefaultBranch, onRepoConnected, fetchGitStatus, handlePush]
  );

  if (!isOpen) return null;

  const pendingCount = gitStatus?.pendingCommits?.length ?? 0;
  const hasChanges = gitStatus?.hasChanges ?? false;
  const canCommit = hasChanges && commitMsg.trim().length > 0 && !committing;
  const canPush = pendingCount > 0 && !pushing;
  const canPull = !pulling && !pushing;

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-[9999] w-80",
        "bg-surface border border-border rounded-xl shadow-xl",
        "flex flex-col"
      )}
      style={{
        top: coords.top,
        right: coords.right,
        maxHeight: "calc(100vh - 80px)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GithubIcon
            className={cn(
              "w-4 h-4",
              ghStatus?.connected ? "text-foreground" : "text-muted opacity-60"
            )}
          />
          <span className="text-sm font-semibold">GitHub</span>
        </div>
        {ghStatus?.connected && (
          <div className="flex items-center gap-1">
            {ghStatus.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ghStatus.avatarUrl}
                alt={ghStatus.username ?? ""}
                className="w-5 h-5 rounded-full"
              />
            )}
            <span className="text-xs text-muted">{ghStatus.username}</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto modern-scrollbar">
        {!ghStatus ? (
          /* Loading */
          <div className="flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-muted" />
          </div>
        ) : !ghStatus.connected ? (
          /* State 1: Not connected */
          <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-soft/60 flex items-center justify-center">
              <GithubIcon className="w-6 h-6 text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect GitHub</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Link your GitHub account to push projects to repositories.
              </p>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleConnect}
              disabled={authLoading}
            >
              {authLoading ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
              {authLoading ? "Redirecting..." : "Connect GitHub Account"}
            </Button>
          </div>
        ) : !hasRepo ? (
          /* State 2: Connected but no repo */
          <div className="flex flex-col gap-0">
            {/* Create new repo */}
            <div className="px-4 py-4 border-b border-border/60">
              <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Create Repository
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateRepo()}
                  placeholder="repository-name"
                  className={cn(
                    "w-full px-3 py-2 text-xs rounded-lg",
                    "bg-bg border border-border",
                    "placeholder:text-muted/60",
                    "focus:outline-none focus:ring-1 focus:ring-accent/60"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setIsPrivate((v) => !v)}
                  className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
                >
                  {isPrivate ? (
                    <Lock size={12} className="text-accent" />
                  ) : (
                    <Globe size={12} />
                  )}
                  <span>{isPrivate ? "Private" : "Public"}</span>
                </button>
                <Button
                  size="sm"
                  className="w-full mt-1"
                  onClick={handleCreateRepo}
                  disabled={repoCreating || !repoName.trim()}
                >
                  {repoCreating ? (
                    <Loader2 size={13} className="animate-spin mr-1.5" />
                  ) : (
                    <Plus size={13} className="mr-1.5" />
                  )}
                  {repoCreating ? "Creating..." : "Create Repository"}
                </Button>
              </div>
            </div>

            {/* Connect existing repo */}
            <div className="px-4 py-3">
              <button
                type="button"
                onClick={handleShowExisting}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors w-full"
              >
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-transform",
                    showExistingRepos && "rotate-180"
                  )}
                />
                Connect existing repository
              </button>
              {showExistingRepos && (
                <div className="mt-2">
                  {reposLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={14} className="animate-spin text-muted" />
                    </div>
                  ) : existingRepos.length === 0 ? (
                    <p className="text-xs text-muted text-center py-3">
                      No repositories found
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60 max-h-40 overflow-y-auto modern-scrollbar rounded-lg border border-border">
                      {existingRepos.map((repo) => (
                        <li key={repo.fullName}>
                          <button
                            type="button"
                            onClick={() => handleConnectExisting(repo)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-soft/40 transition-colors text-left"
                          >
                            {repo.isPrivate ? (
                              <Lock size={10} className="text-muted shrink-0" />
                            ) : (
                              <Globe size={10} className="text-muted shrink-0" />
                            )}
                            <span className="truncate flex-1">{repo.fullName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Disconnect */}
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500 transition-colors"
              >
                <LogOut size={11} />
                Disconnect @{ghStatus.username}
              </button>
            </div>
          </div>
        ) : (
          /* State 3: Connected + repo linked */
          <div className="flex flex-col h-full">
            {/* Repo info */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch size={12} className="text-muted shrink-0" />
                <span className="text-xs font-medium truncate">
                  {githubRepoOwner}/{githubRepoName}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handlePull}
                  disabled={!canPull}
                  className="p-1 rounded hover:bg-soft/60 transition-colors text-muted hover:text-foreground disabled:opacity-40"
                  title="Pull from remote"
                >
                  {pulling ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ArrowDown size={12} />
                  )}
                </button>
                <a
                  href={`https://github.com/${githubRepoOwner}/${githubRepoName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-soft/60 transition-colors text-muted hover:text-foreground"
                  title="Open on GitHub"
                >
                  <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={fetchGitStatus}
                  className="p-1 rounded hover:bg-soft/60 transition-colors text-muted hover:text-foreground"
                  title="Refresh status"
                >
                  <RefreshCw size={12} className={statusLoading ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/projects/${projectId}/github`, { method: "DELETE" });
                    onRepoDisconnected();
                  }}
                  className="p-1 rounded hover:bg-soft/60 transition-colors text-muted hover:text-red-500"
                  title="Disconnect repository"
                >
                  <LogOut size={12} />
                </button>
              </div>
            </div>

            {/* Changed files list — fixed height, scrollable */}
            <div className="flex flex-col shrink-0">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                  Changes
                </span>
                <span className="text-[11px] text-muted">
                  {statusLoading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <>
                      {(gitStatus?.added.length ?? 0) +
                        (gitStatus?.modified.length ?? 0) +
                        (gitStatus?.deleted.length ?? 0)}{" "}
                      files
                    </>
                  )}
                </span>
              </div>
              <div className="h-44 overflow-y-auto modern-scrollbar border-y border-border/60">
                {statusLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={14} className="animate-spin text-muted" />
                  </div>
                ) : (
                  <FileStatusList
                    added={gitStatus?.added ?? []}
                    modified={gitStatus?.modified ?? []}
                    deleted={gitStatus?.deleted ?? []}
                  />
                )}
              </div>
            </div>

            {/* Pending commits count */}
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-elevated/40">
                <GitCommit size={12} className="text-accent shrink-0" />
                <span className="text-xs text-muted">
                  {pendingCount} unpushed{" "}
                  {pendingCount === 1 ? "commit" : "commits"}
                </span>
              </div>
            )}

            {/* Commit message input */}
            <div className="px-3 py-2 border-b border-border/60 shrink-0">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                rows={2}
                className={cn(
                  "w-full px-2.5 py-2 text-xs rounded-lg resize-none",
                  "bg-bg border border-border",
                  "placeholder:text-muted/60",
                  "focus:outline-none focus:ring-1 focus:ring-accent/60"
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Footer: Commit + Push (only when repo is linked) ── */}
      {hasRepo && ghStatus?.connected && (
        <div className="flex gap-2 px-3 py-3 border-t border-border shrink-0 bg-surface">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handleCommit}
            disabled={!canCommit}
          >
            {committing ? (
              <Loader2 size={13} className="animate-spin mr-1" />
            ) : (
              <GitCommit size={13} className="mr-1" />
            )}
            Commit
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => handlePush(false)}
            disabled={!canPush}
          >
            {pushing ? (
              <Loader2 size={13} className="animate-spin mr-1" />
            ) : (
              <Upload size={13} className="mr-1" />
            )}
            {pendingCount > 1 ? `Push ×${pendingCount}` : "Push"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {conflictState && (
        <ConflictModal
          mode={conflictState.mode}
          conflicts={conflictState.conflicts}
          nonConflictedRemote={conflictState.nonConflictedRemote}
          onForcePull={conflictState.mode === "pull" ? handleForcePull : undefined}
          onForcePush={conflictState.mode === "push" ? () => handlePush(true) : undefined}
          onComplete={handleConflictComplete}
          onCancel={() => setConflictState(null)}
          isLoading={conflictLoading || pushing}
        />
      )}
    </>
  );
}

// ── Inline GitHub SVG (custom, minimal) ───────────────────────────────────

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
