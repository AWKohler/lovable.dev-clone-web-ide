'use client';

import { useEffect, useState, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { getPreviewStore, PreviewInfo } from '@/lib/preview-store';
import { FileTree } from './file-tree';
import { CodeEditor } from './code-editor';
import { TerminalTabs } from './terminal-tabs';
import { Preview } from './preview';
import { Button } from '@/components/ui/button';
import { Tabs, TabOption } from '@/components/ui/tabs';
import { PanelLeft, Save, RefreshCw, Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type WorkspaceView = 'code' | 'preview';

interface WorkspaceProps {
  projectId: string;
}

export function Workspace({ projectId }: WorkspaceProps) {
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
  const [files, setFiles] = useState<Record<string, { type: 'file' | 'folder' }>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentView, setCurrentView] = useState<WorkspaceView>('code');
  const [previews, setPreviews] = useState<PreviewInfo[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isDevServerRunning, setIsDevServerRunning] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [devServerProcess, setDevServerProcess] = useState<{ kill: () => void } | null>(null);

  // Helper function definitions - moved to top
  const getFileStructure = useCallback(async (container: WebContainer): Promise<Record<string, { type: 'file' | 'folder' }>> => {
    const files: Record<string, { type: 'file' | 'folder' }> = {};
    
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

  const handleFileSystemChange = useCallback(async (event: Event) => {
    const { container } = (event as CustomEvent).detail;
    if (container) {
      await refreshFileTree(container);
      // Auto-save project state
      await WebContainerManager.saveProjectState(projectId);
    }
  }, [projectId, refreshFileTree]);

  const runNpmInstall = useCallback(async (container: WebContainer) => {
    setIsInstalling(true);
    try {
      // Remove node_modules if it exists
      try {
        await container.fs.rm('/node_modules', { recursive: true, force: true });
      } catch {
        // node_modules might not exist, that's ok
      }
      
      // Run npm install
      const installProcess = await container.spawn('npm', ['install']);
      const exitCode = await installProcess.exit;
      
      if (exitCode === 0) {
        setIsInstalled(true);
        console.log('npm install completed successfully');
      } else {
        console.error('npm install failed with exit code:', exitCode);
        setIsInstalled(false);
      }
    } catch (error) {
      console.error('Failed to run npm install:', error);
      setIsInstalled(false);
    } finally {
      setIsInstalling(false);
    }
  }, []);

  const startDevServer = useCallback(async (container: WebContainer) => {
    if (!isInstalled) {
      await runNpmInstall(container);
    }
    
    setIsStartingServer(true);
    try {
      // Start the dev server
      const serverProcess = await container.spawn('npm', ['run', 'dev']);
      setDevServerProcess(serverProcess);
      console.log('Dev server started');
      
      // The preview store will automatically detect the server and update isDevServerRunning
    } catch (error) {
      console.error('Failed to start dev server:', error);
    } finally {
      setIsStartingServer(false);
    }
  }, [isInstalled, runNpmInstall]);

  const stopDevServer = useCallback(async (container?: WebContainer) => {
    try {
      if (devServerProcess) {
        // Kill the specific dev server process
        devServerProcess.kill();
        setDevServerProcess(null);
        console.log('Dev server stopped via process.kill()');
      } else if (container) {
        // Fallback: try to kill all node processes
        try {
          await container.spawn('pkill', ['-f', 'vite']);
          console.log('Dev server stopped via pkill vite');
        } catch {
          // If pkill fails, try killing node processes
          try {
            await container.spawn('pkill', ['-f', 'node.*dev']);
            console.log('Dev server stopped via pkill node dev');
          } catch {
            console.log('Could not kill dev server processes');
          }
        }
      }
      
      // The preview store will automatically update isDevServerRunning when server stops
    } catch (error) {
      console.error('Failed to stop dev server:', error);
    }
  }, [devServerProcess]);

  const handlePlayStopClick = useCallback(async () => {
    if (!webcontainer) return;
    
    if (isDevServerRunning) {
      await stopDevServer(webcontainer);
    } else {
      await startDevServer(webcontainer);
    }
  }, [webcontainer, isDevServerRunning, startDevServer, stopDevServer]);

  useEffect(() => {
    async function initWebContainer() {
      try {
        const container = await WebContainerManager.getInstance();
        setWebcontainer(container);

        // Initialize preview store
        const previewStore = getPreviewStore();
        previewStore.setWebContainer(container);

        // Subscribe to preview updates
        const unsubscribe = previewStore.subscribe((newPreviews) => {
          setPreviews(prevPreviews => {
            // Auto-switch to preview tab when first server starts
            if (newPreviews.length > 0 && prevPreviews.length === 0) {
              setCurrentView('preview');
            }
            return newPreviews;
          });
          
          // Track if dev server is running
          setIsDevServerRunning(newPreviews.length > 0);
        });

        // Check for saved state first
        const savedState = await WebContainerManager.loadProjectState(projectId);
        
        if (savedState && Object.keys(savedState).length > 0) {
          // Restore saved files
          await WebContainerManager.restoreFiles(container, savedState);
        } else {
          // Initialize with Vite + React + TypeScript + Tailwind structure
          await container.mount({
            'README.md': {
              file: {
                contents: '# React + TypeScript + Vite',
              },
            },
            'package.json': {
              file: {
                contents: JSON.stringify({
                  name: projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  private: true,
                  version: "0.0.0",
                  type: "module",
                  scripts: {
                    dev: "vite",
                    build: "tsc -b && vite build",
                    lint: "eslint .",
                    preview: "vite preview"
                  },
                  dependencies: {
                    "react": "^18.3.1",
                    "react-dom": "^18.3.1",
                    "clsx": "^2.1.1",
                    "tailwind-merge": "^2.5.4"
                  },
                  devDependencies: {
                    "@eslint/js": "^9.17.0",
                    "@tailwindcss/vite": "^4.0.0-beta.6",
                    "@types/node": "^22.10.2",
                    "@types/react": "^18.3.17",
                    "@types/react-dom": "^18.3.5",
                    "@vitejs/plugin-react": "^4.3.4",
                    "eslint": "^9.17.0",
                    "eslint-plugin-react-hooks": "^5.0.0",
                    "eslint-plugin-react-refresh": "^0.4.16",
                    "globals": "^15.13.0",
                    "tailwindcss": "^4.0.0-beta.6",
                    "typescript": "~5.6.2",
                    "typescript-eslint": "^8.18.2",
                    "vite": "^6.0.5"
                  }
                }, null, 2),
              },
            },
            'index.html': {
              file: {
                contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
              },
            },
            'vite.config.ts': {
              file: {
                contents: `import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})`,
              },
            },
            'tsconfig.json': {
              file: {
                contents: JSON.stringify({
                  compilerOptions: {
                    target: "ESNext",
                    useDefineForClassFields: true,
                    lib: ["ESNext", "DOM"],
                    module: "ESNext",
                    skipLibCheck: true,
                    moduleResolution: "bundler",
                    allowImportingTsExtensions: true,
                    resolveJsonModule: true,
                    isolatedModules: true,
                    noEmit: true,
                    jsx: "react-jsx",
                    baseUrl: ".",
                    paths: {
                      "@/*": ["./src/*"],
                    },
                  },
                  include: ["src"],
                  references: [
                    { path: "./tsconfig.app.json" },
                    { path: "./tsconfig.node.json" },
                  ],
                }, null, 2),
              },
            },
            'tsconfig.app.json': {
              file: {
                contents: JSON.stringify({
                  compilerOptions: {
                    tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
                    target: "ES2022",
                    useDefineForClassFields: true,
                    lib: ["ES2022", "DOM", "DOM.Iterable"],
                    module: "ESNext",
                    skipLibCheck: true,
                    moduleResolution: "bundler",
                    allowImportingTsExtensions: true,
                    verbatimModuleSyntax: true,
                    moduleDetection: "force",
                    noEmit: true,
                    jsx: "react-jsx",
                    strict: true,
                    noUnusedLocals: true,
                    noUnusedParameters: true,
                    erasableSyntaxOnly: true,
                    noFallthroughCasesInSwitch: true,
                    noUncheckedSideEffectImports: true,
                    baseUrl: ".",
                    paths: {
                      "@/*": ["./src/*"],
                    },
                  },
                  include: ["src"]
                }, null, 2),
              },
            },
            'tsconfig.node.json': {
              file: {
                contents: JSON.stringify({
                  compilerOptions: {
                    tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
                    target: "ES2023",
                    lib: ["ES2023"],
                    module: "ESNext",
                    skipLibCheck: true,
                    moduleResolution: "bundler",
                    allowImportingTsExtensions: true,
                    verbatimModuleSyntax: true,
                    moduleDetection: "force",
                    noEmit: true,
                    strict: true,
                    noUnusedLocals: true,
                    noUnusedParameters: true,
                    erasableSyntaxOnly: true,
                    noFallthroughCasesInSwitch: true,
                    noUncheckedSideEffectImports: true
                  },
                  include: ["vite.config.ts"]
                }, null, 2),
              },
            },
            'components.json': {
              file: {
                contents: JSON.stringify({
                  $schema: "https://ui.shadcn.com/schema.json",
                  style: "new-york",
                  rsc: false,
                  tsx: true,
                  tailwind: {
                    config: "tailwind.config.js",
                    css: "src/index.css",
                    baseColor: "neutral",
                    cssVariables: true,
                  },
                  aliases: {
                    components: "@/components",
                    utils: "@/lib/utils",
                  },
                }, null, 2),
              },
            },
            'eslint.config.js': {
              file: {
                contents: `import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])`,
              },
            },
            '.gitignore': {
              file: {
                contents: `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`,
              },
            },
            'src': {
              directory: {
                'main.tsx': {
                  file: {
                    contents: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`,
                  },
                },
                'App.tsx': {
                  file: {
                    contents: `function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800">
        ✅ Setup successful! You can now start building with Vite + Tailwind +
        shadcn/ui.
      </h1>
    </div>
  )
}

export default App`,
                  },
                },
                'index.css': {
                  file: {
                    contents: '@import "tailwindcss";',
                  },
                },
                'vite-env.d.ts': {
                  file: {
                    contents: '/// <reference types="vite/client" />',
                  },
                },
                'lib': {
                  directory: {
                    'utils.ts': {
                      file: {
                        contents: `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,
                      },
                    },
                  },
                },
              },
            },
          });
        }

        // Get initial file list
        await refreshFileTree(container);
        
        // Run npm install on page load
        await runNpmInstall(container);
        
        setIsLoading(false);
        
        // Return cleanup function for preview subscription
        return unsubscribe;
      } catch (error) {
        console.error('Failed to initialize WebContainer:', error);
        setIsLoading(false);
        return () => {}; // Empty cleanup function
      }
    }

    let cleanupPreview: (() => void) | undefined;

    initWebContainer().then(cleanup => {
      cleanupPreview = cleanup;
    });

    // Listen for file system changes
    window.addEventListener('webcontainer-fs-change', handleFileSystemChange);

    return () => {
      window.removeEventListener('webcontainer-fs-change', handleFileSystemChange);
      if (cleanupPreview) {
        cleanupPreview();
      }
    };
  }, [projectId, refreshFileTree, handleFileSystemChange, runNpmInstall]);

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
  }, [selectedFile, hasUnsavedChanges, webcontainer, projectId, fileContent]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading WebContainer...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bolt-bg text-white">
      {/* Sidebar - Only show in code view */}
      {showSidebar && currentView === 'code' && (
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
        <div className="h-12 bolt-border border-b flex items-center px-4 gap-4 bg-slate-800/30 backdrop-blur-sm">
          {/* Sidebar toggle - Only in code view */}
          {currentView === 'code' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-slate-400 hover:text-white bolt-hover"
            >
              <PanelLeft size={16} />
            </Button>
          )}

          {/* Tabs */}
          <Tabs
            options={[
              { value: 'code', text: 'Code' },
              { value: 'preview', text: `Preview${previews.length > 0 ? ` (${previews.length})` : ''}` }
            ] as TabOption<WorkspaceView>[]}
            selected={currentView}
            onSelect={setCurrentView}
          />

          {/* Play/Stop Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePlayStopClick}
            disabled={isInstalling || isStartingServer}
            className={cn(
              "flex items-center gap-2 font-medium",
              isDevServerRunning
                ? "text-red-400 hover:text-red-300 hover:bg-red-400/10"
                : "text-green-400 hover:text-green-300 hover:bg-green-400/10"
            )}
          >
            {isInstalling || isStartingServer ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isDevServerRunning ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            <span>
              {isInstalling ? 'Installing...' : 
               isStartingServer ? 'Starting...' : 
               isDevServerRunning ? 'Stop' : 'Start'}
            </span>
          </Button>
          
          {currentView === 'code' && selectedFile && (
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

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative">
          {/* Code View - Always mounted but conditionally visible */}
          <div 
            className={cn(
              "absolute inset-0",
              currentView === 'code' ? "flex flex-col" : "hidden"
            )}
          >
            {/* Code Editor */}
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm">
                <CodeEditor
                  value={fileContent}
                  onChange={handleContentChange}
                  language={getLanguageFromFilename(selectedFile || '')}
                  filename={selectedFile}
                  disabled={isDevServerRunning}
                />
              </div>
              {/* Overlay when dev server is running */}
              {isDevServerRunning && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                  <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-4 py-2 text-slate-300 text-sm">
                    Editor disabled while dev server is running
                  </div>
                </div>
              )}
            </div>

            {/* Terminal - Always mounted, persists across tab switches */}
            <div className="h-64 bolt-border border-t bg-slate-900/95 backdrop-blur-sm">
              <TerminalTabs webcontainer={webcontainer} />
            </div>
          </div>

          {/* Preview View - Always mounted but conditionally visible */}
          <div 
            className={cn(
              "absolute inset-0",
              currentView === 'preview' ? "block" : "hidden"
            )}
          >
            <Preview
              previews={previews}
              activePreviewIndex={activePreviewIndex}
              onActivePreviewChange={setActivePreviewIndex}
            />
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