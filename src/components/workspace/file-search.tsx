"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WebContainer } from "@webcontainer/api";
import { cn } from "@/lib/utils";

type FilesMap = Record<string, { type: "file" | "folder" }>;

interface FileSearchProps {
  files: FilesMap;
  webcontainer: WebContainer | null;
  onOpenFile: (path: string) => void;
}

type Result = {
  path: string;
  line: number;
  preview: string;
};

export function FileSearch({ files, webcontainer, onOpenFile }: FileSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const searchIdRef = useRef(0);

  const filePaths = useMemo(() => {
    return Object.keys(files)
      .filter((p) => files[p].type === "file")
      .filter((p) => !p.includes("/node_modules/") && !p.includes("/.git/") && p !== "/")
      .sort();
  }, [files]);

  const runSearch = useCallback(async (q: string) => {
    if (!webcontainer || !q || q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++searchIdRef.current;
    setSearching(true);
    const res: Result[] = [];
    const needle = q.toLowerCase();

    for (const path of filePaths) {
      try {
        const content = await webcontainer.fs.readFile(path, "utf8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.toLowerCase().includes(needle)) {
            const start = Math.max(0, i - 0);
            const text = lines[start];
            res.push({ path, line: i + 1, preview: text.trim() });
            if (res.length > 200) break;
          }
        }
        if (res.length > 200) break;
      } catch {
        // ignore unreadable files
      }
      if (id !== searchIdRef.current) return; // canceled
    }
    if (id === searchIdRef.current) {
      setResults(res);
      setSearching(false);
    }
  }, [filePaths, webcontainer]);

  // debounce
  useEffect(() => {
    const h = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(h);
  }, [query, runSearch]);

  return (
    <div className="p-2 text-sm">
      <div className="mb-2">
        <div className="flex items-center gap-2 bg-surface border border-border shadow rounded-lg px-3 py-2">
          <span className="text-muted">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            className="flex-1 bg-transparent outline-none"
          />
        </div>
        <div className="mt-1 text-xs text-muted">
          {searching ? "Searching…" : results.length > 0 ? `${results.length} results` : query.length < 2 ? "Type at least 2 characters" : "No results"}
        </div>
      </div>

      <div className="space-y-1 overflow-auto max-h-full">
        {results.map((r, idx) => (
          <button
            key={`${r.path}:${idx}`}
            onClick={() => onOpenFile(r.path)}
            className={cn(
              "w-full text-left px-2 py-2 rounded-md border border-transparent hover:border-border hover:bg-elevated/60 bolt-hover"
            )}
            title={`${r.path}:${r.line}`}
          >
            <div className="text-muted text-xs truncate">{r.path}</div>
            <div className="text-fg truncate">{r.preview}</div>
            <div className="text-muted text-[10px]">line {r.line}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

