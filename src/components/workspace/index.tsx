'use client';

import { useEffect, useState, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { FileTree } from './file-tree';
import { CodeEditor } from './code-editor';
import { TerminalDynamic } from './terminal-dynamic';
import { Button } from '@/components/ui/button';
import { PanelLeft, RotateCcw, Save, RefreshCw } from 'lucide-react';

interface WorkspaceProps {
  projectId: string;
}

export function Workspace({ projectId }: WorkspaceProps) {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
  const [files, setFiles] = useState<Record<string, any>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Helper function definitions - moved to top
  const getFileStructure = useCallback(async (container: WebContainer): Promise<Record<string, any>> => {
    const files: Record<string, any> = {};
    
    async function processDirectory(path: string) {
      try {
        const entries = await container.fs.readdir(path, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
          
          if (entry.isDirectory()) {
            files[fullPath] = { type: 'folder' };
            await processDirectory(fullPath);
          } else {
            files[fullPath] = { type: 'file' };
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${path}:`, error);
      }
    }

    await processDirectory('/');
    return files;
  }, []);

  const refreshFileTree = useCallback(async (container: WebContainer) => {
    const fileList = await getFileStructure(container);
    setFiles(fileList);
  }, [getFileStructure]);

  const handleSaveFile = useCallback(async () => {
    if (!webcontainer || !selectedFile) return;
    
    try {
      await webcontainer.fs.writeFile(selectedFile, fileContent);
      setHasUnsavedChanges(false);
      console.log('File saved:', selectedFile);
      
      // Save project state
      await WebContainerManager.saveProjectState(projectId);
      
      // Refresh file tree to ensure it's in sync
      await refreshFileTree(webcontainer);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [webcontainer, selectedFile, fileContent, projectId, refreshFileTree]);

  const handleFileSelect = useCallback(async (filePath: string) => {
    if (!webcontainer || files[filePath]?.type !== 'file') return;
    
    try {
      const content = await webcontainer.fs.readFile(filePath, 'utf8');
      setSelectedFile(filePath);
      setFileContent(content);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  }, [webcontainer, files]);

  const handleContentChange = useCallback((newContent: string) => {
    setFileContent(newContent);
    setHasUnsavedChanges(fileContent !== newContent);
  }, [fileContent]);

  const handleRefreshFiles = useCallback(async () => {
    if (!webcontainer) return;
    
    setIsRefreshing(true);
    try {
      await refreshFileTree(webcontainer);
      await WebContainerManager.saveProjectState(projectId);
    } catch (error) {
      console.error('Failed to refresh files:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [webcontainer, refreshFileTree, projectId]);

  const handleFileSystemChange = useCallback(async (event: any) => {
    const { container } = event.detail;
    if (container) {
      await refreshFileTree(container);
      // Auto-save project state
      await WebContainerManager.saveProjectState(projectId);
    }
  }, [projectId, refreshFileTree]);

  useEffect(() => {
    async function initWebContainer() {
      try {
        const container = await WebContainerManager.getInstance();
        setWebcontainer(container);

        // Check for saved state first
        const savedState = await WebContainerManager.loadProjectState(projectId);
        
        if (savedState && Object.keys(savedState).length > 0) {
          // Restore saved files
          await WebContainerManager.restoreFiles(container, savedState);
        } else {
          // Initialize with default structure
          await container.mount({
            'README.md': {
              file: {
                contents: `# ${projectId}\n\nWelcome to your new project!\n\nThis project is powered by WebContainer - a full Node.js runtime in your browser.`,
              },
            },
            'package.json': {
              file: {
                contents: JSON.stringify({
                  name: projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  version: '1.0.0',
                  description: 'A WebContainer project',
                  main: 'index.js',
                  scripts: {
                    start: 'node index.js',
                    dev: 'node index.js'
                  },
                  dependencies: {}
                }, null, 2),
              },
            },
            'index.js': {
              file: {
                contents: `// Welcome to your WebContainer project!\nconsole.log('Hello from WebContainer!');\n\n// Try running: npm start`,
              },
            },
          });
        }

        // Get initial file list
        await refreshFileTree(container);
        
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize WebContainer:', error);
        setIsLoading(false);
      }
    }

    initWebContainer();

    // Listen for file system changes
    window.addEventListener('webcontainer-fs-change', handleFileSystemChange);

    return () => {
      window.removeEventListener('webcontainer-fs-change', handleFileSystemChange);
    };
  }, [projectId, refreshFileTree, handleFileSystemChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (selectedFile && hasUnsavedChanges) {
          handleSaveFile();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, hasUnsavedChanges, handleSaveFile]);

  // Auto-save on page unload
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = '';
        await handleSaveFile();
      }
      
      // Save project state on exit
      await WebContainerManager.saveProjectState(projectId);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, projectId, handleSaveFile]);

  // Auto-save when switching files
  useEffect(() => {
    return () => {
      // This cleanup runs when selectedFile is about to change
      if (hasUnsavedChanges && webcontainer && selectedFile) {
        webcontainer.fs.writeFile(selectedFile, fileContent).catch(console.error);
        WebContainerManager.saveProjectState(projectId).catch(console.error);
      }
    };
  }, [selectedFile]); // Only depend on selectedFile

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading WebContainer...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bolt-bg text-white">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-80 bolt-border border-r flex flex-col bg-slate-800/50 backdrop-blur-sm">
          <div className="p-4 bolt-border border-b">
            <h2 className="text-lg font-semibold text-slate-200">Explorer</h2>
          </div>
          <div className="flex-1 overflow-auto modern-scrollbar">
            <FileTree 
              files={files}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-12 bolt-border border-b flex items-center px-4 gap-2 bg-slate-800/30 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="text-slate-400 hover:text-white bolt-hover"
          >
            <PanelLeft size={16} />
          </Button>
          
          {selectedFile && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">/</span>
                <span className="text-white font-medium bg-slate-700/50 px-2 py-1 rounded flex items-center gap-2">
                  {selectedFile.split('/').pop()}
                  {hasUnsavedChanges && (
                    <span className="w-2 h-2 rounded-full bg-orange-500" title="Unsaved changes" />
                  )}
                </span>
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshFiles}
                  disabled={isRefreshing}
                  className="text-slate-400 hover:text-white bolt-hover"
                >
                  <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                  <span className="ml-1">Refresh</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveFile}
                  className="text-slate-400 hover:text-white bolt-hover"
                >
                  <Save size={16} />
                  <span className="ml-1">Save</span>
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Editor and Terminal */}
        <div className="flex-1 flex flex-col">
          {/* Code Editor */}
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm">
              <CodeEditor
                value={fileContent}
                onChange={handleContentChange}
                language={getLanguageFromFilename(selectedFile || '')}
                filename={selectedFile}
              />
            </div>
          </div>

          {/* Terminal */}
          <div className="h-64 bolt-border border-t bg-slate-900/95 backdrop-blur-sm">
            <TerminalDynamic webcontainer={webcontainer} />
          </div>
        </div>
      </div>
    </div>
  );
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'scss',
    py: 'python',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rs: 'rust',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
  };

  return languageMap[ext || ''] || 'plaintext';
}