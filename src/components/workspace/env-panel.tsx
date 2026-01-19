'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Download, Upload, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnvVar {
  id?: string;
  key: string;
  value: string;
  isSecret: boolean;
  isSystem?: boolean;
}

interface EnvPanelProps {
  projectId: string;
  onEnvVarsChange?: () => void;
}

export function EnvPanel({ projectId, onEnvVarsChange }: EnvPanelProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [systemEnvVars, setSystemEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [showValues, setShowValues] = useState<Set<string>>(new Set());
  const [bulkContent, setBulkContent] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEnvVars = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/env`);
      if (res.ok) {
        const data = await res.json();
        setEnvVars(data.envVars || []);
        setSystemEnvVars(data.systemEnvVars || []);
      } else {
        setError('Failed to load environment variables');
      }
    } catch (e) {
      console.error('Failed to fetch env vars:', e);
      setError('Failed to load environment variables');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchEnvVars();
  }, [fetchEnvVars]);

  const handleAdd = async () => {
    if (!newKey.trim()) return;

    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.toUpperCase(),
          value: newValue,
          isSecret: newIsSecret,
        }),
      });

      if (res.ok) {
        setNewKey('');
        setNewValue('');
        setNewIsSecret(false);
        fetchEnvVars();
        onEnvVarsChange?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add variable');
      }
    } catch (e) {
      console.error('Failed to add env var:', e);
      setError('Failed to add variable');
    }
  };

  const handleDelete = async (key: string) => {
    setError(null);
    try {
      await fetch(`/api/projects/${projectId}/env`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      fetchEnvVars();
      onEnvVarsChange?.();
    } catch (e) {
      console.error('Failed to delete env var:', e);
      setError('Failed to delete variable');
    }
  };

  const handleBulkImport = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/env`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bulkContent }),
      });

      if (res.ok) {
        const data = await res.json();
        setBulkContent('');
        setShowBulkImport(false);
        fetchEnvVars();
        onEnvVarsChange?.();
        console.log(`Imported ${data.imported} variables`);
      } else {
        setError('Failed to import variables');
      }
    } catch (e) {
      console.error('Failed to import env vars:', e);
      setError('Failed to import variables');
    }
  };

  const handleDownloadExample = () => {
    const lines: string[] = [];

    // Add header comment
    lines.push('# Environment Variables');
    lines.push('# Copy this file to .env and fill in your values');
    lines.push('');

    // Add system vars
    for (const env of systemEnvVars) {
      lines.push(`${env.key}=${env.value}`);
    }

    // Add user vars (placeholder values for secrets)
    for (const env of envVars) {
      if (env.isSecret) {
        lines.push(`${env.key}=your-value-here`);
      } else {
        lines.push(`${env.key}=${env.value}`);
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env.example';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleShowValue = (key: string) => {
    setShowValues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="p-4 text-muted flex items-center gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="p-3 text-sm space-y-4 overflow-y-auto modern-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-fg text-xs uppercase tracking-wide">Environment Variables</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setShowBulkImport(!showBulkImport)}
            title="Import from .env"
          >
            <Upload size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleDownloadExample}
            title="Download .env.example"
          >
            <Download size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={fetchEnvVars}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1.5 border border-red-400/20">
          {error}
        </div>
      )}

      {/* Bulk Import */}
      {showBulkImport && (
        <div className="space-y-2 p-2 bg-elevated rounded-md border border-border">
          <p className="text-xs text-muted">Paste your .env file content:</p>
          <textarea
            value={bulkContent}
            onChange={(e) => setBulkContent(e.target.value)}
            placeholder="KEY=value&#10;ANOTHER_KEY=another-value"
            className="w-full h-24 bg-surface border border-border rounded p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleBulkImport} className="h-7 text-xs">
              Import
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowBulkImport(false)} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* System Variables (Read-only) */}
      {systemEnvVars.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted font-medium uppercase tracking-wide">System (Read-only)</p>
          {systemEnvVars.map((env) => (
            <div
              key={env.key}
              className="flex items-center gap-2 p-2 bg-elevated/50 rounded-md border border-border/50"
            >
              <Lock size={12} className="text-muted flex-shrink-0" />
              <span className="font-mono text-xs text-muted flex-shrink-0">{env.key}</span>
              <span className="text-muted flex-shrink-0">=</span>
              <span className="font-mono text-xs text-fg truncate flex-1" title={env.value}>
                {env.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* User Variables */}
      <div className="space-y-2">
        <p className="text-xs text-muted font-medium uppercase tracking-wide">User Variables</p>
        {envVars.length > 0 ? (
          envVars.map((env) => (
            <div
              key={env.key}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md border",
                "bg-elevated border-border hover:border-accent/30 transition-colors"
              )}
            >
              <span className="font-mono text-xs text-fg flex-shrink-0">{env.key}</span>
              <span className="text-muted flex-shrink-0">=</span>
              <span className="font-mono text-xs text-fg truncate flex-1" title={env.isSecret ? undefined : env.value}>
                {env.isSecret && !showValues.has(env.key) ? '********' : env.value}
              </span>
              {env.isSecret && (
                <button
                  onClick={() => toggleShowValue(env.key)}
                  className="text-muted hover:text-fg transition-colors flex-shrink-0"
                  title={showValues.has(env.key) ? 'Hide value' : 'Show value'}
                >
                  {showValues.has(env.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
              <button
                onClick={() => handleDelete(env.key)}
                className="text-muted hover:text-red-400 transition-colors flex-shrink-0"
                title="Delete variable"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted italic py-2">No custom variables defined</p>
        )}
      </div>

      {/* Add New Variable */}
      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-xs text-muted font-medium uppercase tracking-wide">Add Variable</p>
        <div className="flex gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            placeholder="KEY_NAME"
            className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex gap-2">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            type={newIsSecret ? 'password' : 'text'}
            className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={newIsSecret}
              onChange={(e) => setNewIsSecret(e.target.checked)}
              className="rounded border-border bg-surface"
            />
            Mark as secret
          </label>
          <Button size="sm" onClick={handleAdd} disabled={!newKey.trim()} className="h-7 text-xs">
            <Plus size={14} className="mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
