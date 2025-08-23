'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  files: Record<string, any>;
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
            'flex items-center cursor-pointer hover:bg-slate-700/50 px-2 py-1 text-sm bolt-hover',
            isSelected && !isFolder && 'bg-blue-600/80 hover:bg-blue-600 shadow-lg',
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
                <ChevronDown size={14} className="mr-1 text-slate-400" />
              ) : (
                <ChevronRight size={14} className="mr-1 text-slate-400" />
              )}
              {isExpanded ? (
                <FolderOpen size={16} className="mr-2 text-blue-400" />
              ) : (
                <Folder size={16} className="mr-2 text-blue-400" />
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
            isSelected && !isFolder ? 'text-white' : 'text-slate-300'
          )}>
            {name}
          </span>
        </div>
      );
    }
    
    return tree;
  };

  return (
    <div className="p-2">
      <div
        className="flex items-center cursor-pointer hover:bg-slate-700/50 px-2 py-1 text-sm rounded-md bolt-hover"
        onClick={() => toggleFolder('/')}
      >
        {expandedFolders.has('/') ? (
          <ChevronDown size={14} className="mr-1 text-slate-400" />
        ) : (
          <ChevronRight size={14} className="mr-1 text-slate-400" />
        )}
        {expandedFolders.has('/') ? (
          <FolderOpen size={16} className="mr-2 text-blue-400" />
        ) : (
          <Folder size={16} className="mr-2 text-blue-400" />
        )}
        <span className="text-slate-300">Project</span>
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
        return 'text-slate-400';
    }
  };

  return <File size={16} className={cn('mr-2', getIconColor(ext || ''))} />;
}