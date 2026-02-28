"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PreviewPopup() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  if (!url) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 text-sm">
        No preview URL provided.
      </div>
    );
  }

  return (
    <iframe
      src={url}
      className="fixed inset-0 w-full h-full border-0"
      allow="cross-origin-isolated"
      title="Preview"
    />
  );
}

export default function PreviewPopupPage() {
  return (
    <Suspense>
      <PreviewPopup />
    </Suspense>
  );
}
