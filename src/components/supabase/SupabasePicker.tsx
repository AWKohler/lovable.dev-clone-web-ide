"use client";

import { useEffect, useMemo, useState } from 'react';
import { Database, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Org = { id: string; name?: string; slug?: string; raw?: Record<string, unknown> };
type Project = { id: string; name?: string; organization_id?: string; ref?: string; raw?: Record<string, unknown> };

export function SupabasePicker({
  className,
  projectId,
  onSelected,
}: {
  className?: string;
  projectId?: string; // When provided, selection persists by calling API
  onSelected?: (ref: string) => void; // For landing page to carry ref forward
}) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [hoverOrg, setHoverOrg] = useState<string | null>(null);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [loading, setLoading] = useState(false);

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
        ? data.map((p: Record<string, unknown>) => ({ id: String(p.id || p.ref), name: String(p.name || ''), organization_id: String(p.organization_id || ''), ref: String(p.ref || ''), raw: p }))
        : [];
      setProjects((prev) => ({ ...prev, [orgId]: mapped }));
    } catch {}
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
      } catch (e) {
        console.error('Failed to connect Supabase project', e);
      }
    }
    onSelected?.(ref);
    setOpen(false);
  };

  const buttonLabel = useMemo(() => 'Supabase', []);

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-neutral-50 transition"
        title="Connect Supabase"
      >
        <Database className="h-4 w-4" />
        <span>{buttonLabel}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-72 rounded-xl border border-black/10 bg-white shadow-lg">
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
                  <div className="absolute z-50 left-full top-0 ml-2 w-80 rounded-xl border border-black/10 bg-white shadow-lg">
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
                      <a
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50"
                        href={`https://supabase.com/dashboard/new${o.slug ? `?org=${encodeURIComponent(o.slug)}` : ''}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Plus className="h-4 w-4" /> Create project
                      </a>
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
