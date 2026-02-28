"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";

function PreviewPopup() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";
  const [reloadKey, setReloadKey] = useState(0);

  if (!url) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 text-sm">
        No preview URL provided.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950">
      {/* Minimal toolbar */}
      <div className="flex items-center gap-2 px-3 h-9 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <div className="flex-1 px-2 py-0.5 rounded bg-neutral-800 text-xs text-neutral-400 font-mono truncate select-all">
          {url}
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="Reload"
        >
          <RefreshCw size={13} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          title="Open URL directly"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Full-screen iframe */}
      <iframe
        key={reloadKey}
        src={url}
        className="flex-1 w-full border-0"
        allow="cross-origin-isolated"
        title="Preview"
      />
    </div>
  );
}

export default function PreviewPopupPage() {
  return (
    <Suspense>
      <PreviewPopup />
    </Suspense>
  );
}
