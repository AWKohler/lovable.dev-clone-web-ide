"use client";

import { useEffect, useRef, useState } from 'react';

interface ConvexDashboardProps {
  projectId: string;
}

interface DashboardSession {
  deploymentUrl: string;
  deploymentName: string;
  adminKey: string;
}

export function ConvexDashboard({ projectId }: ConvexDashboardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch credentials once per projectId
  useEffect(() => {
    setSession(null);
    setError(null);
    fetch(`/api/projects/${projectId}/database-session`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<DashboardSession>;
      })
      .then(setSession)
      .catch((err) => setError(err.message));
  }, [projectId]);

  // Listen for credential requests from the embedded dashboard and respond
  useEffect(() => {
    if (!session) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://dashboard-embedded.convex.dev') return;
      if (event.data?.type !== 'dashboard-credentials-request') return;

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'dashboard-credentials',
          adminKey: session!.adminKey,
          deploymentUrl: session!.deploymentUrl,
          deploymentName: session!.deploymentName,
        },
        'https://dashboard-embedded.convex.dev'
      );
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [session]);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center w-full h-full text-sm text-gray-400">
        Loading database…
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src="https://dashboard-embedded.convex.dev"
      className="w-full h-full border-none"
      allow="clipboard-write"
      title="Convex Database Dashboard"
    />
  );
}
