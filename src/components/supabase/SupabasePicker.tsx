"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

type Org = { id: string; name?: string; slug?: string; raw?: Record<string, unknown> };
type Project = { id: string; name?: string; organization_id?: string; ref?: string; created_at?: string; raw?: Record<string, unknown> };

export function SupabasePicker({
  className,
  projectId,
  onSelected,
}: {
  className?: string;
  projectId?: string; // When provided, selection persists by calling API
  onSelected?: (ref: string) => void; // For landing page to carry ref forward
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [hoverOrg, setHoverOrg] = useState<string | null>(null);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [loading, setLoading] = useState(false);
  const [creatingOrgId, setCreatingOrgId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const baselineIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/supabase/organizations')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const mapped: Org[] = Array.isArray(data)
          ? data.map((o: Record<string, unknown>) => ({ id: String(o.id || o.uuid || o.slug || o), name: String(o.name || o.slug || 'Organization'), slug: o.slug as string, raw: o }))
          : [];
        setOrgs(mapped);
      })
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [open]);

  const loadProjects = async (orgId: string) => {
    if (projects[orgId]) return;
    try {
      const res = await fetch(`/api/supabase/projects?org_id=${encodeURIComponent(orgId)}`);
      const data = await res.json();
      const mapped: Project[] = Array.isArray(data)
        ? data.map((p: Record<string, unknown>) => ({ id: String(p.id || p.ref), name: String(p.name || ''), organization_id: String(p.organization_id || ''), ref: String(p.ref || ''), created_at: String(p.created_at || ''), raw: p }))
        : [];
      setProjects((prev) => ({ ...prev, [orgId]: mapped }));
    } catch {}
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    baselineIdsRef.current = null;
    setCreatingOrgId(null);
  };

  const pollForNewProject = async (org: Org, attemptsLeft: number) => {
    if (!org.id || attemptsLeft <= 0) {
      toast({ title: 'Not detected', description: 'New Supabase project was not detected. You can select it from the list once it appears.' });
      return stopPolling();
    }
    try {
      const res = await fetch(`/api/supabase/projects?org_id=${encodeURIComponent(org.id)}`, { cache: 'no-store' });
      const data = await res.json();
      const mapped: Project[] = Array.isArray(data)
        ? data.map((p: Record<string, unknown>) => ({ id: String(p.id || p.ref), name: String(p.name || ''), organization_id: String(p.organization_id || ''), ref: String(p.ref || ''), created_at: String(p.created_at || ''), raw: p }))
        : [];
      const currentIds = new Set(mapped.map((p) => p.id));
      const baseline = baselineIdsRef.current ?? new Set<string>();
      // Find new ids not in baseline
      const newOnes = [...currentIds].filter((id) => !baseline.has(id));
      if (newOnes.length > 0) {
        // Prefer the newest by created_at if available
        let candidate: Project | undefined = mapped
          .filter((p) => newOnes.includes(p.id))
          .sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))[0];
        if (!candidate) candidate = mapped.find((p) => newOnes.includes(p.id));
        const ref = candidate?.ref || candidate?.id;
        if (ref) {
          if (projectId) {
            try {
              await fetch('/api/supabase/connect-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, projectRef: ref, organizationId: org.id, organizationName: org.name || org.slug }),
              });
              toast({ title: 'Supabase linked', description: `${candidate?.name || ref} is now connected.` });
            } catch (e) {
              console.error('Auto-link Supabase project failed', e);
              toast({ title: 'Link failed', description: 'Could not link the new project automatically.' });
            }
          }
          onSelected?.(ref);
          setSelectedName(candidate?.name || ref);
          setOpen(false);
          stopPolling();
          return;
        }
      }
    } catch {}
    // schedule next attempt
    pollRef.current = window.setTimeout(() => pollForNewProject(org, attemptsLeft - 1), 4000);
  };

  const beginCreateProjectFlow = async (org: Org) => {
    // Always fetch a fresh baseline snapshot for reliability
    try {
      const res = await fetch(`/api/supabase/projects?org_id=${encodeURIComponent(org.id)}`, { cache: 'no-store' });
      const data = await res.json();
      const mapped: Project[] = Array.isArray(data)
        ? data.map((p: Record<string, unknown>) => ({ id: String(p.id || p.ref), name: String(p.name || ''), organization_id: String(p.organization_id || ''), ref: String(p.ref || ''), created_at: String(p.created_at || ''), raw: p }))
        : [];
      baselineIdsRef.current = new Set(mapped.map((p) => p.id));
    } catch {
      baselineIdsRef.current = new Set((projects[org.id] || []).map((p) => p.id));
    }
    setCreatingOrgId(org.id);
    // Start polling for up to ~2 minutes
    pollForNewProject(org, 30);
  };

  const handlePick = async (org: Org, proj: Project) => {
    const ref = proj.ref || proj.id;
    if (!ref) return;
    if (projectId) {
      try {
        await fetch('/api/supabase/connect-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, projectRef: ref, organizationId: org.id, organizationName: org.name || org.slug }),
        });
        toast({ title: 'Supabase linked', description: `${proj.name || ref} is now connected.` });
      } catch (e) {
        console.error('Failed to connect Supabase project', e);
        toast({ title: 'Link failed', description: 'Could not link the selected project.' });
      }
    }
    onSelected?.(ref);
    setSelectedName(proj.name || ref);
    setOpen(false);
  };

  const buttonLabel = useMemo(() => selectedName || 'Supabase', [selectedName]);

  // If in a workspace, pull existing link and set label
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const res = await fetch(`/api/supabase/link?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.connected) setSelectedName(data.name || data.ref || null);
      } catch {}
    })();
  }, [projectId]);

  // Close on ESC and click outside while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        stopPolling();
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        stopPolling();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  useEffect(() => {
    if (!open) stopPolling();
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition border',
          selectedName
            ? 'bg-neutral-900 text-white border-neutral-900'
            : 'border-black/10 bg-white text-neutral-800 shadow hover:bg-neutral-50'
        )}
        title="Connect Supabase"
      >
        <Database className={cn('h-4 w-4', selectedName ? 'text-emerald-400' : '')} />
        <span>{buttonLabel}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute z-[200] mt-2 w-72 rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="px-3 py-2 text-xs font-medium text-neutral-500">Supabase Projects</div>
          {/* Important: allow submenus to overflow this container for hover popouts */}
          <div className="max-h-72 overflow-visible relative">
            {loading && <div className="px-3 py-2 text-sm text-neutral-500">Loading...</div>}
            {!loading && orgs.length === 0 && (
              <div className="px-3 py-2 text-sm text-neutral-500">No organizations connected</div>
            )}
            {!loading && orgs.map((o) => (
              <div
                key={o.id}
                className="group relative hover:bg-neutral-50 cursor-default"
                onMouseEnter={() => { setHoverOrg(o.id); loadProjects(o.id); }}
                onMouseLeave={() => setHoverOrg((prev) => (prev === o.id ? null : prev))}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="truncate text-sm">{o.name || o.slug || o.id}</div>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </div>
                {hoverOrg === o.id && (
                  <div className="absolute z-[210] left-full -ml-px top-0 w-80 rounded-xl border border-black/10 bg-white shadow-lg">
                    <div className="px-3 py-2">
                      <input
                        placeholder="Search projects..."
                        className="w-full rounded-md border border-black/10 bg-neutral-50 px-2 py-1.5 text-sm outline-none"
                      />
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {(projects[o.id] || []).length === 0 ? (
                        <div className="px-3 py-6 text-sm text-neutral-500 text-center">No projects found.</div>
                      ) : (
                        (projects[o.id] || []).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handlePick(o, p)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                          >
                            {p.name || p.ref || p.id}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-black/10">
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 text-left"
                        onClick={(e) => {
                          e.preventDefault();
                          // Open Supabase new-project page for this org
                          const orgKey = o.slug || o.id;
                          const url = orgKey
                            ? `https://supabase.com/dashboard/org/${encodeURIComponent(orgKey)}/new`
                            : 'https://supabase.com/dashboard/new';
                          window.open(url, '_blank', 'noopener,noreferrer');
                          // Start watching for the new project to appear and link automatically
                          beginCreateProjectFlow(o);
                        }}
                      >
                        <Plus className="h-4 w-4" /> Create project
                      </button>
                      {creatingOrgId === o.id && (
                        <div className="px-3 pb-2 text-xs text-neutral-500">Waiting for new project to be created…</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-black/10">
            <a
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50"
              href="/api/connect/supabase/start"
            >
              <Plus className="h-4 w-4" /> Add organization
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
