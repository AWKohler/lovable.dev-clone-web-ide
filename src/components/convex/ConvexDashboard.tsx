"use client";

import { useEffect, useState } from 'react';

interface ConvexDashboardProps {
  projectId: string;
}

export function ConvexDashboard({ projectId }: ConvexDashboardProps) {
  const [session, setSession] = useState<{ deploymentUrl: string; adminKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(null);
    setError(null);
    fetch(`/api/projects/${projectId}/database-session`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(setSession)
      .catch((err) => setError(err.message));
  }, [projectId]);

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

  const dashboardUrl =
    `https://dashboard.convex.dev/deployment/${encodeURIComponent(session.deploymentUrl)}` +
    `?adminKey=${encodeURIComponent(session.adminKey)}`;

  return (
    <iframe
      src={dashboardUrl}
      className="w-full h-full border-none"
      allow="clipboard-write"
      title="Convex Database Dashboard"
    />
  );
}
