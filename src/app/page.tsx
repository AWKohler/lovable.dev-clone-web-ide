'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Code, FileText } from 'lucide-react';

export default function Home() {
  const [isCreating, setIsCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const router = useRouter();

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
        }),
      });

      if (response.ok) {
        const project = await response.json();
        router.push(`/workspace/${project.id}`);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg to-surface">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 rounded-xl bg-accent text-accent-foreground shadow-sm">
                <Code size={32} />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-fg mb-4">
              WebContainer IDE
            </h1>
            <p className="text-xl text-muted mb-8">
              Create and edit code projects in your browser with a full development environment
            </p>
          </div>

          {/* Create Project Form */}
          <div className="max-w-md mx-auto">
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <textarea
                  placeholder="Project description (optional)"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-transparent resize-none"
                />
              </div>
              <Button
                type="submit"
                disabled={isCreating || !projectName.trim()}
                size="lg"
                className="w-full"
              >
                {isCreating ? (
                  'Creating...'
                ) : (
                  <>
                    <Plus size={20} />
                    Create Project
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Features */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="p-3 rounded-xl bg-elevated text-fg inline-block mb-4 border border-border">
                <FileText size={24} />
              </div>
              <h3 className="text-lg font-semibold text-fg mb-2">
                File Browser
              </h3>
              <p className="text-muted">
                Navigate and manage your project files with an intuitive file tree
              </p>
            </div>
            <div className="text-center">
              <div className="p-3 rounded-xl bg-elevated text-fg inline-block mb-4 border border-border">
                <Code size={24} />
              </div>
              <h3 className="text-lg font-semibold text-fg mb-2">
                Code Editor
              </h3>
              <p className="text-muted">
                Full-featured Monaco editor with syntax highlighting and IntelliSense
              </p>
            </div>
            <div className="text-center">
              <div className="p-3 rounded-xl bg-elevated text-fg inline-block mb-4 border border-border">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M6 8l.01 0"/>
                  <path d="M10 8l.01 0"/>
                  <path d="M14 8l.01 0"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-fg mb-2">
                Terminal
              </h3>
              <p className="text-muted">
                Integrated terminal powered by WebContainer for running commands
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
