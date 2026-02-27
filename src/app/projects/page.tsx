'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import {
  Plus,
  Laptop,
  Smartphone,
  Cog,
  Calendar,
  Layers,
  MoreVertical,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { SettingsModal } from '@/components/settings/SettingsModal';
import type { Project } from '@/db/schema';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setDeletingId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeletingId(null);
      setOpenMenuId(null);
    }
  };

  const openProject = (projectId: string) => {
    router.push(`/workspace/${projectId}`);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="antialiased text-neutral-900 bg-white min-h-screen">
      {/* Background gradients */}
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-1/3 -left-1/4 h-[80vh] w-[80vw] rounded-full bg-gradient-to-br from-indigo-300 via-sky-200 to-white blur-3xl opacity-60"></div>
          <div className="absolute top-1/3 left-1/2 h-[90vh] w-[80vw] -translate-x-1/2 rounded-full bg-gradient-to-tr from-purple-300 via-blue-200 to-rose-200 blur-3xl opacity-50"></div>
        </div>

        {/* Nav */}
        <header className="relative">
          <div className="mx-auto max-w-7xl px-6 py-5">
            <div className="flex items-center justify-between">
              <Link className="flex items-center gap-3" href="/">
                <img
                  src="/brand/botflow-glyph.svg"
                  alt=""
                  className="h-8 w-8"
                />
                <img
                  src="/brand/botflow-wordmark.svg"
                  alt="Botflow"
                  className="h-5 w-auto"
                />
              </Link>

              <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-700">
                <a className="text-black font-medium" href="/projects">My Projects</a>
                <a className="hover:text-black transition" href="#">Community</a>
                <a className="hover:text-black transition" href="#">Learn</a>
              </nav>

              <div className="flex items-center gap-2">
                <SignedOut>
                  <SignInButton>
                    <button className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 transition">
                      Log in
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-2.5 py-2 text-sm text-neutral-900 shadow-sm hover:bg-neutral-50 transition"
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Cog className="h-4 w-4" />
                  </button>
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative">
          <div className="mx-auto max-w-7xl px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">My Projects</h1>
                <p className="mt-1 text-neutral-600">
                  {projects.length} project{projects.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-md hover:opacity-90 transition"
              >
                <Plus className="h-4 w-4" />
                New Project
              </Link>
            </div>

            <SignedOut>
              <div className="text-center py-20">
                <p className="text-neutral-600 mb-4">Please sign in to view your projects.</p>
                <SignInButton>
                  <button className="inline-flex items-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-md hover:opacity-90 transition">
                    Sign In
                  </button>
                </SignInButton>
              </div>
            </SignedOut>

            <SignedIn>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-black/10 bg-white/50 backdrop-blur-sm animate-pulse"
                    >
                      <div className="aspect-video bg-neutral-200 rounded-t-2xl"></div>
                      <div className="p-4">
                        <div className="h-5 bg-neutral-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 mb-4">
                    <Layers className="h-8 w-8 text-neutral-400" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
                  <p className="text-neutral-600 mb-6">Create your first project to get started.</p>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-md hover:opacity-90 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Create Project
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="group relative rounded-2xl border border-black/10 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-black/20 transition-all duration-200 cursor-pointer"
                      onClick={() => openProject(project.id)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-neutral-100 to-neutral-50">
                        {project.thumbnailUrl ? (
                          <img
                            src={project.thumbnailUrl}
                            alt={project.name}
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center text-neutral-400">
                              {project.platform === 'mobile' ? (
                                <Smartphone className="h-10 w-10 mb-2" />
                              ) : (
                                <Laptop className="h-10 w-10 mb-2" />
                              )}
                              <span className="text-xs">No preview</span>
                            </div>
                          </div>
                        )}

                        {/* Platform badge */}
                        <div className="absolute top-3 left-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium backdrop-blur-sm',
                              project.platform === 'mobile'
                                ? 'bg-purple-500/90 text-white'
                                : 'bg-white/90 text-neutral-700'
                            )}
                          >
                            {project.platform === 'mobile' ? (
                              <Smartphone className="h-3 w-3" />
                            ) : (
                              <Laptop className="h-3 w-3" />
                            )}
                            {project.platform === 'mobile' ? 'Mobile' : 'Web'}
                          </span>
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-lg">
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-neutral-900 truncate" title={project.name}>
                              {project.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(project.createdAt)}</span>
                              <span className="text-neutral-300">•</span>
                              <span className="truncate">{project.model}</span>
                            </div>
                          </div>

                          {/* Menu button */}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === project.id ? null : project.id);
                              }}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-neutral-100 transition"
                            >
                              <MoreVertical className="h-4 w-4 text-neutral-500" />
                            </button>

                            {/* Dropdown menu */}
                            {openMenuId === project.id && (
                              <div
                                className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-black/10 bg-white shadow-lg z-10 py-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => openProject(project.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </button>
                                <button
                                  onClick={() => handleDeleteProject(project.id)}
                                  disabled={deletingId === project.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {deletingId === project.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SignedIn>
          </div>
        </main>
      </div>

      {/* Close menu when clicking outside */}
      {openMenuId && (
        <div className="fixed inset-0 z-0" onClick={() => setOpenMenuId(null)} />
      )}

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
