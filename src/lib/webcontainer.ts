import { WebContainer } from '@webcontainer/api';

export class WebContainerManager {
  private static instance: WebContainer | null = null;
  private static isBooting = false;
  private static bootPromise: Promise<WebContainer> | null = null;

  static async getInstance(): Promise<WebContainer> {
    if (this.instance) {
      return this.instance;
    }

    if (this.isBooting && this.bootPromise) {
      return this.bootPromise;
    }

    this.isBooting = true;
    this.bootPromise = this.boot();

    try {
      this.instance = await this.bootPromise;
      return this.instance;
    } finally {
      this.isBooting = false;
      this.bootPromise = null;
    }
  }

  // Force reset the WebContainer instance
  static async resetInstance(): Promise<WebContainer> {
    console.log('🔄 Forcing WebContainer reset...');
    
    // Clear existing instance
    this.instance = null;
    this.isBooting = false;
    this.bootPromise = null;
    
    // Get fresh instance
    return this.getInstance();
  }

  private static async boot(): Promise<WebContainer> {
    const container = await WebContainer.boot({
      coep: 'credentialless'
    });
    
    // Set up file system watching with debouncing
    let watchTimeout: NodeJS.Timeout;
    container.fs.watch('/', { recursive: true }, (event, filename) => {
      // Debounce file system changes to avoid excessive updates
      clearTimeout(watchTimeout);
      watchTimeout = setTimeout(() => {
        // Dispatch custom event for file changes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('webcontainer-fs-change', {
            detail: { event, filename, container }
          }));
        }
      }, 250);
    });

    return container;
  }

  static async saveProjectState(projectId: string): Promise<void> {
    if (!this.instance) return;

    try {
      const files = await this.getAllFiles(this.instance);
      localStorage.setItem(`webcontainer-${projectId}`, JSON.stringify(files));
    } catch (error) {
      console.warn('Failed to save project state:', error);
    }
  }

  static async loadProjectState(projectId: string): Promise<Record<string, unknown> | null> {
    try {
      const saved = localStorage.getItem(`webcontainer-${projectId}`);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.warn('Failed to load project state:', error);
      return null;
    }
  }

  private static async getAllFiles(container: WebContainer): Promise<Record<string, unknown>> {
    const files: Record<string, unknown> = {};
    
    async function processDirectory(path: string) {
      try {
        const entries = await container.fs.readdir(path, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
          
          if (entry.isDirectory()) {
            files[fullPath] = { type: 'folder' };
            await processDirectory(fullPath);
          } else {
            try {
              const content = await container.fs.readFile(fullPath, 'utf8');
              files[fullPath] = { 
                type: 'file',
                content: content
              };
            } catch {
              // Handle binary files
              files[fullPath] = { type: 'file' };
            }
          }
        }
      } catch (error) {
        console.warn(`Error reading directory ${path}:`, error);
      }
    }

    await processDirectory('/');
    return files;
  }

  static async restoreFiles(container: WebContainer, files: Record<string, unknown>): Promise<void> {
    // Clear existing files first (except node_modules)
    try {
      const entries = await container.fs.readdir('/', { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          await container.fs.rm(`/${entry.name}`, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn('Failed to clear existing files:', error);
    }

    // Restore files
    const sortedPaths = Object.keys(files).sort((a, b) => a.length - b.length);
    
    for (const filePath of sortedPaths) {
      const fileData = files[filePath];
      
      if ((fileData as { type: string }).type === 'folder') {
        try {
          await container.fs.mkdir(filePath, { recursive: true });
        } catch (error) {
          console.warn(`Failed to create directory ${filePath}:`, error);
        }
      } else if ((fileData as { type: string; content?: string }).type === 'file' && (fileData as { content?: string }).content !== undefined) {
        try {
          // Ensure parent directory exists
          const parentDir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
          if (parentDir !== '/') {
            await container.fs.mkdir(parentDir, { recursive: true });
          }
          
          await container.fs.writeFile(filePath, (fileData as { content: string }).content);
        } catch (error) {
          console.warn(`Failed to restore file ${filePath}:`, error);
        }
      }
    }
  }

  static destroy(): void {
    this.instance = null;
    this.isBooting = false;
    this.bootPromise = null;
  }
}