'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileNode {
  type: 'file' | 'folder';
  [key: string]: unknown;
}

interface FileTreeProps {
  files: Record<string, FileNode>;
  selectedFile: string | null;
  onFileSelect: (filePath: string) => void;
}

export function FileTree({ files, selectedFile, onFileSelect }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const renderFileTree = () => {
    const sortedPaths = Object.keys(files).sort();
    const tree: JSX.Element[] = [];
    
    for (const filePath of sortedPaths) {
      if (filePath === '/') continue;
      
      const pathParts = filePath.split('/').filter(Boolean);
      const depth = pathParts.length - 1;
      const name = pathParts[pathParts.length - 1];
      const parentPath = '/' + pathParts.slice(0, -1).join('/');
      
      // Check if parent folder is expanded
      if (depth > 0 && !expandedFolders.has(parentPath)) {
        continue;
      }
      
      const isFolder = files[filePath].type === 'folder';
      const isExpanded = expandedFolders.has(filePath);
      const isSelected = selectedFile === filePath;

      tree.push(
        <div
          key={filePath}
          className={cn(
            'flex items-center cursor-pointer hover:bg-elevated/60 px-2 py-1 text-sm bolt-hover',
            isSelected && !isFolder && 'bg-accent/20 hover:bg-accent/25 shadow-sm',
            'transition-all duration-200 rounded-md mx-1'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(filePath);
            } else {
              onFileSelect(filePath);
            }
          }}
        >
          {isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDown size={14} className="mr-1 text-muted" />
              ) : (
                <ChevronRight size={14} className="mr-1 text-muted" />
              )}
              {isExpanded ? (
                <FolderOpen size={16} className="mr-2 text-accent" />
              ) : (
                <Folder size={16} className="mr-2 text-accent" />
              )}
            </>
          ) : (
            <>
              <div className="w-4 mr-1" />
              <FileIcon filename={name} />
            </>
          )}
          <span className={cn(
            'truncate',
            isSelected && !isFolder ? 'text-fg' : 'text-muted'
          )}>
            {name}
          </span>
        </div>
      );
    }
    
    return tree;
  };

  return (
    <div className="p-2 text-fg">
      <div
        className="flex items-center cursor-pointer hover:bg-elevated/60 px-2 py-1 text-sm rounded-md bolt-hover"
        onClick={() => toggleFolder('/')}
      >
        {expandedFolders.has('/') ? (
          <ChevronDown size={14} className="mr-1 text-muted" />
        ) : (
          <ChevronRight size={14} className="mr-1 text-muted" />
        )}
        {expandedFolders.has('/') ? (
          <FolderOpen size={16} className="mr-2 text-accent" />
        ) : (
          <Folder size={16} className="mr-2 text-accent" />
        )}
        <span className="text-muted">Project</span>
      </div>
      {expandedFolders.has('/') && renderFileTree()}
    </div>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const getIconColor = (extension: string) => {
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'text-yellow-400';
      case 'ts':
      case 'tsx':
        return 'text-blue-400';
      case 'json':
        return 'text-yellow-600';
      case 'md':
        return 'text-blue-300';
      case 'html':
        return 'text-orange-400';
      case 'css':
      case 'scss':
        return 'text-blue-500';
      case 'py':
        return 'text-green-400';
      case 'rb':
        return 'text-red-400';
      default:
        return 'text-muted';
    }
  };

  return <File size={16} className={cn('mr-2', getIconColor(ext || ''))} />;
}
